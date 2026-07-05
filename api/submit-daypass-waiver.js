/* ============================================================
   Fit Pit — Day Pass visitor waiver
   ------------------------------------------------------------
   POST   /api/submit-daypass-waiver           → public: sign a waiver
   GET    /api/submit-daypass-waiver?pin=…      → admin: list waivers
   GET    /api/submit-daypass-waiver?pin=…&id=… → admin: one waiver (incl. images)

   Backs the non-public /daypass-waiver page that day-pass visitors reach by
   scanning a QR code at reception.

   POST behaviour:
     1. Stores the signed waiver (incl. a low-res selfie) in the shared
        "Gym Manager" Supabase `daypass_waivers` table — the durable legal
        record. When the DB is configured this MUST succeed, else we 500 and the
        visitor is asked to retry (we never report success without the record).
     2. Best-effort: emails a copy to the gym with the signature + selfie
        attached, so staff are notified immediately.
     3. Retention: signed waivers are purged after 12 months by a pg_cron job
        (see db/daypass-waivers-migration.sql).

   Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CLASS_ADMIN_PIN,
        SMTP_HOST/PORT/USER/PASS, WAIVER_NOTIFY_EMAIL
   ============================================================ */

import nodemailer from 'nodemailer';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lnxzqiydnpshaooflebs.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ADMIN_PIN = process.env.CLASS_ADMIN_PIN || '2026';
const ADMIN_EMAIL = process.env.WAIVER_NOTIFY_EMAIL || 'petergrant01@gmail.com';

// Signatures and selfies are small; cap them so this public endpoint can't be
// used to push large blobs into the shared DB.
const MAX_SIGNATURE_LEN = 600_000; // ~600KB base64 — a signature PNG is far smaller
const MAX_SELFIE_LEN = 1_800_000; // ~1.8MB base64 — a downscaled JPEG selfie

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

const clean = (v, n = 120) =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '';

async function sb(path, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Columns returned to the admin list view (everything except the heavy blobs).
const LIST_COLS =
  'id,full_name,contact_number,emergency_contact_name,emergency_contact_number,email,visit_date,signature_type,signed_at';

export default async function handler(req, res) {
  // ---------- Admin: list / detail (PIN-gated) ----------
  if (req.method === 'GET') {
    const pin = req.headers['x-admin-pin'] || (req.query && req.query.pin);
    if (pin == null || String(pin) !== ADMIN_PIN) return res.status(401).json({ error: 'unauthorized' });
    if (!SERVICE_KEY) return res.status(503).json({ error: 'not_configured' });
    res.setHeader('Cache-Control', 'no-store');
    try {
      const id = req.query && req.query.id;
      if (id) {
        if (!uuidRe.test(String(id))) return res.status(400).json({ error: 'bad_id' });
        const rows = await sb(`daypass_waivers?id=eq.${id}&select=*&limit=1`);
        const waiver = rows && rows[0];
        if (!waiver) return res.status(404).json({ error: 'not_found' });
        return res.status(200).json({ ok: true, waiver });
      }
      const rows = await sb(`daypass_waivers?select=${LIST_COLS}&order=signed_at.desc&limit=1000`);
      return res.status(200).json({ ok: true, waivers: rows || [] });
    } catch (err) {
      console.error('daypass waiver GET error:', err);
      return res.status(500).json({ error: 'read_failed', message: String(err.message || err) });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // ---------- Public: sign a waiver ----------
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch {
      return res.status(400).json({ error: 'bad_json' });
    }
  }
  body = body && typeof body === 'object' ? body : {};

  // --- Normalise + validate ---
  const full_name = clean(body.full_name, 120);
  const contact_number = clean(body.contact_number, 40);
  const emergency_contact_name = clean(body.emergency_contact_name, 120);
  const emergency_contact_number = clean(body.emergency_contact_number, 40); // optional
  const email = clean(body.email, 160);
  const rawVisit = clean(body.visit_date, 20);
  const visit_date = dateRe.test(rawVisit) ? rawVisit : null; // bad/blank → null, never blocks insert
  const date_of_signing = clean(body.date_of_signing, 40);
  const health_declaration = body.health_declaration === true;
  const consent = body.consent === true;

  const sig = body.signature && typeof body.signature === 'object' ? body.signature : {};
  const signature_type = sig.type === 'draw' || sig.type === 'type' ? sig.type : '';
  const signature_data = typeof sig.data === 'string' ? sig.data.trim() : '';
  const selfie_data = typeof body.selfie === 'string' ? body.selfie.trim() : '';

  const missing = [];
  if (!full_name) missing.push('full_name');
  if (!contact_number) missing.push('contact_number');
  if (!signature_type || !signature_data) missing.push('signature');
  if (!selfie_data) missing.push('selfie');
  if (missing.length) return res.status(400).json({ error: 'missing_fields', fields: missing });

  if (!consent || !health_declaration) return res.status(400).json({ error: 'consent_required' });

  if (signature_data.length > MAX_SIGNATURE_LEN) return res.status(413).json({ error: 'signature_too_large' });
  if (signature_type === 'draw' && !signature_data.startsWith('data:image/')) {
    return res.status(400).json({ error: 'bad_signature' });
  }
  if (signature_type === 'type' && signature_data.length < 2) {
    return res.status(400).json({ error: 'bad_signature' });
  }
  if (!selfie_data.startsWith('data:image/')) return res.status(400).json({ error: 'bad_selfie' });
  if (selfie_data.length > MAX_SELFIE_LEN) return res.status(413).json({ error: 'selfie_too_large' });

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    '';
  const user_agent = clean(req.headers['user-agent'], 400);

  const record = {
    full_name,
    contact_number,
    emergency_contact_name: emergency_contact_name || null,
    emergency_contact_number: emergency_contact_number || null,
    email: email || null,
    visit_date,
    health_declaration,
    consent,
    signature_type,
    signature_data,
    selfie_data,
    waiver_version: clean(body.waiver_version, 40) || 'daypass-v1',
    ip: ip || null,
    user_agent: user_agent || null,
  };

  // 1) Durable store — the system of record. When configured, it MUST succeed.
  let stored = false;
  let storedId = null;
  if (SERVICE_KEY) {
    try {
      const inserted = await sb('daypass_waivers', {
        method: 'POST',
        body: [record],
        prefer: 'return=representation',
      });
      stored = true;
      storedId = inserted && inserted[0] && inserted[0].id;
    } catch (err) {
      console.error('daypass waiver DB insert failed:', String(err.message || err));
      return res.status(500).json({
        error: 'store_failed',
        message: 'We could not save your waiver. Please try again or ask a member of staff.',
      });
    }
  }

  // 2) Best-effort email notification (with signature + selfie attached).
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  let emailed = false;
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: parseInt(SMTP_PORT || '587'),
        secure: parseInt(SMTP_PORT || '587') === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      });

      const attachments = [];
      if (signature_type === 'draw') {
        attachments.push({
          filename: 'signature.png',
          content: Buffer.from(signature_data.split(';base64,').pop(), 'base64'),
          contentType: 'image/png',
        });
      }
      const selfieMime = selfie_data.slice(5, selfie_data.indexOf(';')) || 'image/jpeg';
      attachments.push({
        filename: `selfie.${selfieMime.includes('png') ? 'png' : 'jpg'}`,
        content: Buffer.from(selfie_data.split(';base64,').pop(), 'base64'),
        contentType: selfieMime,
      });

      await transporter.sendMail({
        from: SMTP_USER || 'no-reply@fitpitznz.com',
        to: ADMIN_EMAIL,
        subject: `Day Pass Waiver signed: ${full_name}`,
        text: `A Day Pass visitor waiver has been signed via the website.

Visitor:
--------
Full Name: ${full_name}
Contact Number: ${contact_number}
Emergency Contact: ${emergency_contact_name || '(not given)'} — ${emergency_contact_number || '(not given)'}
Email: ${email || '(not given)'}
Intended Visit Date: ${visit_date || '(not given)'}

Declarations:
-------------
Health & fitness declaration accepted: ${health_declaration ? 'Yes' : 'No'}
Waiver & rules agreed: ${consent ? 'Yes' : 'No'}

Signature: ${signature_type === 'draw' ? 'Drawn (attached as signature.png)' : `Typed — "${signature_data}"`}
Selfie: attached
Signed: ${date_of_signing || new Date().toISOString()}
Stored in database: ${stored ? `Yes (id ${storedId})` : 'No'}
You can also view this waiver in the admin panel (Day Pass Waivers tab).

— Fit Pit ZNZ Website`,
        attachments,
      });
      emailed = true;
    } catch (err) {
      console.error('daypass waiver email failed:', String(err.message || err));
    }
  }

  if (stored) return res.status(200).json({ success: true, stored: true, emailed, id: storedId });

  // No SERVICE_KEY configured (e.g. local/dry-run): fall back to email, else log.
  if (emailed) return res.status(200).json({ success: true, stored: false, emailed: true });

  if (!(SMTP_HOST && SMTP_USER && SMTP_PASS)) {
    console.warn('Day pass waiver received (dry-run, no DB/SMTP configured):', {
      full_name,
      contact_number,
      signature_type,
      has_selfie: !!selfie_data,
    });
    return res.status(200).json({ success: true, stored: false, emailed: false, dryRun: true });
  }

  return res.status(500).json({ error: 'submit_failed', message: 'Could not store or send the waiver.' });
}
