/* ============================================================
   Fit Pit — class registration
   ------------------------------------------------------------
   Public sign-up for a class on the website timetable, stored in
   the shared "Gym Manager" `class_registrations` table so the ops
   app sees them too.

   - POST /api/register  { classId, name }   → public. Registers a
                          guest by name (capacity-checked).
   - GET  /api/register?classId=<uuid>       → PIN-gated. Returns the
                          list of registered names for the admin.

   Env: SUPABASE_SERVICE_ROLE_KEY (required), SUPABASE_URL, CLASS_ADMIN_PIN
   ============================================================ */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lnxzqiydnpshaooflebs.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ADMIN_PIN = process.env.CLASS_ADMIN_PIN || '2026';

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v, n = 60) => (typeof v === 'string' && v.length ? v.slice(0, n) : null);
const active = (r) => (r.status || 'registered') !== 'cancelled';

async function sb(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export default async function handler(req, res) {
  if (!SERVICE_KEY) return res.status(503).json({ error: 'not_configured' });

  // --- Admin: list registrant names for a class (PIN required) ---
  if (req.method === 'GET') {
    const pin = req.headers['x-admin-pin'] || (req.query && req.query.pin);
    if (pin == null || String(pin) !== ADMIN_PIN) return res.status(401).json({ error: 'unauthorized' });
    const classId = req.query && req.query.classId;
    if (!uuidRe.test(String(classId || ''))) return res.status(400).json({ error: 'bad_class' });
    try {
      const regs = await sb(
        `class_registrations?class_id=eq.${classId}&select=guest_name,member_id,created_at,status&order=created_at.asc`
      );
      const names = (regs || []).filter(active).map((r) => r.guest_name || '(member)');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok: true, names, registered: names.length });
    } catch (err) {
      console.error('register GET error:', err);
      return res.status(500).json({ error: 'read_failed', message: String(err.message || err) });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // --- Public: register a guest by name ---
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch {
      return res.status(400).json({ error: 'bad_json' });
    }
  }
  body = body && typeof body === 'object' ? body : {};

  const classId = String(body.classId || '');
  const name = str(body.name, 60);
  if (!uuidRe.test(classId)) return res.status(400).json({ error: 'bad_class' });
  if (!name || !name.trim()) return res.status(400).json({ error: 'name_required', message: 'Please enter your name.' });
  const cleanName = name.trim();

  try {
    const rows = await sb(`classes?id=eq.${classId}&select=id,max_capacity,name,date`);
    const cls = rows && rows[0];
    if (!cls) return res.status(404).json({ error: 'class_not_found' });
    const cap = cls.max_capacity != null ? cls.max_capacity : 10;

    const regs = await sb(`class_registrations?class_id=eq.${classId}&select=guest_name,status`);
    const current = (regs || []).filter(active);

    // Already on the list (same name) — treat as success, don't double-add.
    if (current.some((r) => (r.guest_name || '').trim().toLowerCase() === cleanName.toLowerCase())) {
      return res.status(200).json({ ok: true, already: true, registered: current.length, spaces: Math.max(0, cap - current.length) });
    }
    if (current.length >= cap) {
      return res.status(409).json({ error: 'full', message: 'Sorry, this class is full.', registered: current.length, spaces: 0 });
    }

    await sb('class_registrations', {
      method: 'POST',
      body: [{ class_id: classId, guest_name: cleanName, registered_by: 'website', status: 'registered' }],
    });
    const newCount = current.length + 1;
    return res.status(200).json({ ok: true, registered: newCount, spaces: Math.max(0, cap - newCount) });
  } catch (err) {
    console.error('register POST error:', err);
    return res.status(500).json({ error: 'register_failed', message: String(err.message || err) });
  }
}
