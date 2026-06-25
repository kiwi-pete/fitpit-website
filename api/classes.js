/* ============================================================
   Fit Pit — class schedule API
   ------------------------------------------------------------
   Single source of truth for the public weekly class timetable
   shown on fitpitznz.com, backed by the shared "Gym Manager"
   Supabase project (service-role key, server-side only).

   - GET  /api/classes            → public. Returns the class-type
                                     library + the weekly timetable.
   - POST /api/classes            → PIN-gated. Saves the library and
                                     timetable, and materialises dated
                                     rows into the shared public.classes
                                     table so the Gym Manager app and
                                     member registrations see them too.

   Class types live in settings.classTemplates (shared with the ops
   app). The weekly timetable lives in settings.webClassSchedule
   (website-owned). Each weekly slot owns a recurrence_group_id; only
   rows carrying one of those ids are ever touched here, and a row that
   already has a member registration is never deleted.

   Env:
     SUPABASE_SERVICE_ROLE_KEY   (required for any data access)
     SUPABASE_URL                (optional; defaults to the project URL)
     CLASS_ADMIN_PIN             (optional; defaults to '2026')
   ============================================================ */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lnxzqiydnpshaooflebs.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ADMIN_PIN = process.env.CLASS_ADMIN_PIN || '2026';
const SETTINGS_ID = 'global';

// How many future weeks of dated class rows to keep materialised per slot.
const HORIZON_WEEKS = 8;

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/; // HH:MM

const str = (v, n = 200) => (typeof v === 'string' && v.length ? v.slice(0, n) : null);
const reqTime = (v) => (typeof v === 'string' && timeRe.test(v) ? v : null);
const withSecs = (t) => (t && t.length === 5 ? `${t}:00` : t); // 'HH:MM' -> 'HH:MM:00'
// public.classes.end_time is NOT NULL, so derive a sensible end (+1h) when the
// slot has none.
function resolveEnd(start, end) {
  if (end) return withSecs(end);
  const [h, m] = start.split(':').map(Number);
  return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

async function sb(path, { method = 'GET', body, repr = false } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: repr ? 'return=representation' : 'return=minimal',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function inList(ids) {
  return `(${ids.map((id) => encodeURIComponent(id)).join(',')})`;
}

async function readSettings() {
  const rows = await sb(
    `settings?id=eq.${SETTINGS_ID}&select=classTemplates,webClassSchedule&limit=1`
  );
  const row = (rows && rows[0]) || {};
  return {
    templates: Array.isArray(row.classTemplates) ? row.classTemplates : [],
    schedule: Array.isArray(row.webClassSchedule) ? row.webClassSchedule : [],
  };
}

// ---- sanitisers ------------------------------------------------------------

function cleanTemplate(t) {
  if (!t || typeof t !== 'object') return null;
  const name = str(t.name, 80);
  if (!name) return null;
  const start = reqTime(t.start_time);
  const end = reqTime(t.end_time);
  return {
    id: str(t.id, 60) || `template-${name.toLowerCase().replace(/\s+/g, '-')}`,
    name,
    description: str(t.description, 400),
    instructor: str(t.instructor, 80),
    color: str(t.color, 20),
    start_time: start,
    end_time: end,
    max_capacity: Number.isFinite(+t.max_capacity) ? Math.max(0, Math.min(999, +t.max_capacity)) : 20,
  };
}

function cleanSlot(s) {
  if (!s || typeof s !== 'object') return null;
  const weekday = Number(s.weekday);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return null;
  const start = reqTime(s.start_time);
  const end = reqTime(s.end_time);
  if (!start) return null;
  const gid = uuidRe.test(s.recurrence_group_id) ? s.recurrence_group_id : null;
  if (!gid) return null; // every slot must carry a stable group id (made client-side)
  return {
    id: str(s.id, 60) || gid,
    weekday,
    templateId: str(s.templateId, 60),
    name: str(s.name, 80) || 'Class',
    start_time: start,
    end_time: end,
    recurrence_group_id: gid,
  };
}

// Next `count` calendar dates (YYYY-MM-DD, UTC) for a weekday where 0=Mon..6=Sun.
function nextDates(weekday, count) {
  const jsTarget = (weekday + 1) % 7; // JS: 0=Sun..6=Sat
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  while (d.getUTCDay() !== jsTarget) d.setUTCDate(d.getUTCDate() + 1);
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

// Keep public.classes in sync with the weekly timetable. Only rows whose
// recurrence_group_id belongs to a current or retired website slot are touched,
// and a row with a member registration is never deleted.
async function materialise(slots, templates, retiredGroupIds) {
  const tById = {};
  templates.forEach((t) => (tById[t.id] = t));

  const activeIds = slots.map((s) => s.recurrence_group_id);
  const allGroupIds = [...new Set([...activeIds, ...retiredGroupIds])];
  const today = new Date().toISOString().slice(0, 10);

  let existing = [];
  if (allGroupIds.length) {
    existing = await sb(
      `classes?recurrence_group_id=in.${inList(allGroupIds)}&date=gte.${today}` +
        `&select=id,date,name,start_time,end_time,recurrence_group_id`
    );
  }

  // Which existing rows already have a registration — never delete those.
  const reserved = new Set();
  if (existing.length) {
    const regs = await sb(
      `class_registrations?class_id=in.${inList(existing.map((r) => r.id))}&select=class_id`
    );
    (regs || []).forEach((r) => reserved.add(r.class_id));
  }

  const byGroup = {};
  existing.forEach((r) => (byGroup[r.recurrence_group_id] = byGroup[r.recurrence_group_id] || []).push(r));

  const toInsert = [];
  const toDelete = [];
  const updates = []; // { id, patch }

  for (const slot of slots) {
    const tmpl = (slot.templateId && tById[slot.templateId]) || {};
    const name = slot.name || tmpl.name || 'Class';
    const wantStart = withSecs(slot.start_time);
    const wantEnd = resolveEnd(slot.start_time, slot.end_time);
    const targets = nextDates(slot.weekday, HORIZON_WEEKS);

    const rows = byGroup[slot.recurrence_group_id] || [];
    const byDate = {};
    rows.forEach((r) => (byDate[r.date] = r));

    for (const date of targets) {
      const row = byDate[date];
      if (!row) {
        toInsert.push({
          name,
          description: tmpl.description || null,
          instructor: tmpl.instructor || null,
          date,
          start_time: wantStart,
          end_time: wantEnd,
          max_capacity: tmpl.max_capacity != null ? tmpl.max_capacity : 20,
          recurrence_group_id: slot.recurrence_group_id,
        });
      } else {
        if (row.name !== name || row.start_time !== wantStart || row.end_time !== wantEnd) {
          updates.push({ id: row.id, patch: { name, start_time: wantStart, end_time: wantEnd } });
        }
        delete byDate[date];
      }
    }
    // Future rows for this slot that are no longer wanted (slot retimed/old).
    Object.values(byDate).forEach((r) => {
      if (!reserved.has(r.id)) toDelete.push(r.id);
    });
  }

  // Retired slots: drop their remaining future rows (unless someone registered).
  retiredGroupIds.forEach((gid) => {
    (byGroup[gid] || []).forEach((r) => {
      if (!reserved.has(r.id)) toDelete.push(r.id);
    });
  });

  if (toDelete.length) await sb(`classes?id=in.${inList(toDelete)}`, { method: 'DELETE' });
  if (toInsert.length) await sb('classes', { method: 'POST', body: toInsert });
  for (const u of updates) {
    await sb(`classes?id=eq.${u.id}`, { method: 'PATCH', body: u.patch });
  }

  return { inserted: toInsert.length, updated: updates.length, deleted: toDelete.length };
}

// ---- handler ---------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method === 'GET') {
    if (!SERVICE_KEY) return res.status(200).json({ configured: false, templates: [], schedule: [] });
    try {
      const { templates, schedule } = await readSettings();
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=600');
      return res.status(200).json({ configured: true, templates, schedule });
    } catch (err) {
      console.error('classes GET error:', err);
      return res.status(500).json({ error: 'read_failed', message: String(err.message || err) });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
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
  const ok = pin != null && String(pin) === ADMIN_PIN;

  // Lightweight gate check used by the login screen.
  if (body.action === 'verify') return res.status(200).json({ ok });

  if (!ok) return res.status(401).json({ error: 'unauthorized' });
  if (!SERVICE_KEY) return res.status(503).json({ error: 'not_configured' });

  try {
    const prev = await readSettings();

    const templates = Array.isArray(body.templates)
      ? body.templates.map(cleanTemplate).filter(Boolean)
      : prev.templates;
    const schedule = Array.isArray(body.schedule)
      ? body.schedule.map(cleanSlot).filter(Boolean)
      : prev.schedule;

    // Persist the library + timetable to the shared settings row.
    await sb(`settings?id=eq.${SETTINGS_ID}`, {
      method: 'PATCH',
      body: { classTemplates: templates, webClassSchedule: schedule },
    });

    // Reconcile the dated ops rows. Group ids dropped from the timetable retire.
    const activeIds = new Set(schedule.map((s) => s.recurrence_group_id));
    const retired = prev.schedule
      .map((s) => s.recurrence_group_id)
      .filter((gid) => uuidRe.test(gid) && !activeIds.has(gid));

    let materialised = { inserted: 0, updated: 0, deleted: 0 };
    try {
      materialised = await materialise(schedule, templates, [...new Set(retired)]);
    } catch (err) {
      // Settings already saved → the public site is correct even if the ops
      // mirror lagged. Surface it without failing the save.
      console.error('classes materialise error:', err);
      return res.status(200).json({ ok: true, templates, schedule, materialised: null, warning: String(err.message || err) });
    }

    return res.status(200).json({ ok: true, templates, schedule, materialised });
  } catch (err) {
    console.error('classes POST error:', err);
    return res.status(500).json({ error: 'save_failed', message: String(err.message || err) });
  }
}
