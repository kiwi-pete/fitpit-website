/* ============================================================
   Fit Pit — class registration
   ------------------------------------------------------------
   Public sign-up for a class on the website timetable, stored in
   the shared "Gym Manager" `class_registrations` table so the ops
   app sees them too.

   - POST /api/register  { classId, name }   → public. Registers a
                          guest by name (capacity-checked). With a valid
                          admin PIN the capacity check is waived so the
                          gym can add walk-ins to a full class.
   - GET  /api/register?classId=<uuid>       → PIN-gated. Returns the
                          registrations for the admin (id + name).
   - DELETE /api/register?classId=<uuid>&registrationId=<uuid>
                          → PIN-gated. Cancels a single registration
                          (soft delete via status='cancelled').

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

  // --- Admin: list registrations for a class (PIN required) ---
  if (req.method === 'GET') {
    const pin = req.headers['x-admin-pin'] || (req.query && req.query.pin);
    if (pin == null || String(pin) !== ADMIN_PIN) return res.status(401).json({ error: 'unauthorized' });
    const classId = req.query && req.query.classId;
    if (!uuidRe.test(String(classId || ''))) return res.status(400).json({ error: 'bad_class' });
    try {
      const regs = (
        await sb(
          `class_registrations?class_id=eq.${classId}&select=id,guest_name,member_id,created_at,status&order=created_at.asc`
        )
      ).filter(active);

      // Resolve member names so the roster shows real names, not "(member)".
      const memberIds = [...new Set(regs.map((r) => r.member_id).filter(Boolean))];
      const memberName = {};
      if (memberIds.length) {
        const members = await sb(
          `members?id=in.(${memberIds.map((id) => encodeURIComponent(id)).join(',')})&select=id,name`
        );
        (members || []).forEach((m) => (memberName[m.id] = m.name));
      }

      const registrations = regs.map((r) => ({
        id: r.id,
        name: r.guest_name || memberName[r.member_id] || '(member)',
        isMember: !!r.member_id,
      }));
      const names = registrations.map((r) => r.name); // kept for backwards compatibility
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok: true, registrations, names, registered: registrations.length });
    } catch (err) {
      console.error('register GET error:', err);
      return res.status(500).json({ error: 'read_failed', message: String(err.message || err) });
    }
  }

  // --- Admin: remove (cancel) a single registration (PIN required) ---
  if (req.method === 'DELETE') {
    const pin = req.headers['x-admin-pin'] || (req.query && req.query.pin);
    if (pin == null || String(pin) !== ADMIN_PIN) return res.status(401).json({ error: 'unauthorized' });
    const registrationId = req.query && req.query.registrationId;
    if (!uuidRe.test(String(registrationId || ''))) return res.status(400).json({ error: 'bad_registration' });
    try {
      // Soft delete: keep the row but mark it cancelled, matching how the ops
      // app and our own count logic treat cancellations (excluded everywhere).
      await sb(`class_registrations?id=eq.${registrationId}`, {
        method: 'PATCH',
        body: { status: 'cancelled' },
      });
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('register DELETE error:', err);
      return res.status(500).json({ error: 'delete_failed', message: String(err.message || err) });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, DELETE');
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

  // An admin PIN (from the schedule editor) lets the gym add a walk-in even to
  // a full class; public sign-ups stay capacity-checked.
  const pin = req.headers['x-admin-pin'] || body.pin;
  const isAdmin = pin != null && String(pin) === ADMIN_PIN;

  const classId = String(body.classId || '');
  const name = str(body.name, 60);
  if (!uuidRe.test(classId)) return res.status(400).json({ error: 'bad_class' });
  if (!name || !name.trim()) return res.status(400).json({ error: 'name_required', message: 'Please enter your name.' });
  const cleanName = name.trim();

  try {
    const rows = await sb(`classes?id=eq.${classId}&select=id,max_capacity,name,date`);
    const cls = rows && rows[0];
    if (!cls) return res.status(404).json({ error: 'class_not_found' });
    const cap = cls.max_capacity != null ? cls.max_capacity : 12;

    const regs = await sb(`class_registrations?class_id=eq.${classId}&select=guest_name,status`);
    const current = (regs || []).filter(active);

    // Already on the list (same name) — treat as success, don't double-add.
    if (current.some((r) => (r.guest_name || '').trim().toLowerCase() === cleanName.toLowerCase())) {
      return res.status(200).json({ ok: true, already: true, registered: current.length, spaces: Math.max(0, cap - current.length) });
    }
    if (!isAdmin && current.length >= cap) {
      return res.status(409).json({ error: 'full', message: 'Sorry, this class is full.', registered: current.length, spaces: 0 });
    }

    await sb('class_registrations', {
      method: 'POST',
      body: [{ class_id: classId, guest_name: cleanName, registered_by: isAdmin ? 'admin' : 'website', status: 'registered' }],
    });
    const newCount = current.length + 1;
    return res.status(200).json({ ok: true, registered: newCount, spaces: Math.max(0, cap - newCount) });
  } catch (err) {
    console.error('register POST error:', err);
    return res.status(500).json({ error: 'register_failed', message: String(err.message || err) });
  }
}
