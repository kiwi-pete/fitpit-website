/* ============================================================
   Fit Pit — class image upload
   ------------------------------------------------------------
   PIN-gated upload for class-type images shown on the public
   timetable. Stores the file in the shared "Gym Manager" Supabase
   Storage (public `gym-manager` bucket, `class-images/` folder)
   using the service-role key, and returns its public URL.

   POST /api/upload  { pin, contentType, data }  (data = base64 / data-URL)
     -> { ok: true, url }

   Env: SUPABASE_SERVICE_ROLE_KEY (required), SUPABASE_URL, CLASS_ADMIN_PIN
   ============================================================ */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lnxzqiydnpshaooflebs.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ADMIN_PIN = process.env.CLASS_ADMIN_PIN || '2026';
const BUCKET = 'gym-manager';
const PREFIX = 'class-images';
const ALLOWED_FOLDERS = new Set(['class-images', 'site-images']);
const MAX_BYTES = 6_000_000;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch {
      return res.status(400).json({ error: 'bad_json' });
    }
  }
  body = body && typeof body === 'object' ? body : {};

  const pin = req.headers['x-admin-pin'] || body.pin;
  if (pin == null || String(pin) !== ADMIN_PIN) return res.status(401).json({ error: 'unauthorized' });
  if (!SERVICE_KEY) return res.status(503).json({ error: 'not_configured' });

  const ct = String(body.contentType || '').toLowerCase();
  if (!EXT[ct]) return res.status(400).json({ error: 'unsupported_type', message: 'Use a JPEG, PNG or WebP image.' });

  let b64 = String(body.data || '');
  const marker = b64.indexOf('base64,');
  if (marker >= 0) b64 = b64.slice(marker + 7);
  let bytes;
  try {
    bytes = Buffer.from(b64, 'base64');
  } catch {
    return res.status(400).json({ error: 'bad_data' });
  }
  if (!bytes.length) return res.status(400).json({ error: 'empty' });
  if (bytes.length > MAX_BYTES) return res.status(413).json({ error: 'too_large', message: 'Image must be under 6MB.' });

  const folder = ALLOWED_FOLDERS.has(String(body.folder)) ? String(body.folder) : PREFIX;
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${folder}/${Date.now()}-${rand}.${EXT[ct]}`;

  try {
    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': ct,
        'x-upsert': 'true',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
      body: bytes,
    });
    if (!up.ok) return res.status(500).json({ error: 'upload_failed', message: await up.text() });
    const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
    return res.status(200).json({ ok: true, url });
  } catch (err) {
    console.error('upload error:', err);
    return res.status(500).json({ error: 'upload_failed', message: String(err.message || err) });
  }
}
