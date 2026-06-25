/* ============================================================
   Fit Pit — class schedule API
   ------------------------------------------------------------
   Source of truth for the public class timetable on fitpitznz.com,
   backed by the shared "Gym Manager" Supabase project (service-role
   key, server-side only).

   - GET  /api/classes   → public. Returns the class-type library +
                           the dated timetable entries.
   - POST /api/classes   → PIN-gated. Saves the library + timetable
                           and mirrors future dated entries into the
                           shared public.classes table (registration-
                           safe) so the Gym Manager app sees them too.

   Class types live in settings.classTemplates (shared with the ops
   app; the website also stores an optional `image` URL per type).
   The timetable lives in settings.webClassSchedule as an array of
   DATED entries: { id, date, templateId, name, start_time, end_time,
   recurrence_group_id }. Each entry owns a recurrence_group_id and
   maps 1:1 to a public.classes row; a row that already has a member
   registration is never deleted.

   Env:
     SUPABASE_SERVICE_ROLE_KEY   (required for any data access)
     SUPABASE_URL                (optional; defaults to the project URL)
     CLASS_ADMIN_PIN             (optional; defaults to '2026')
   ============================================================ */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lnxzqiydnpshaooflebs.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ADMIN_PIN = process.env.CLASS_ADMIN_PIN || '2026';
const SETTINGS_ID = 'global';

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/; // HH:MM
const dateRe = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD

const str = (v, n = 200) => (typeof v === 'string' && v.length ? v.slice(0, n) : null);
const reqTime = (v) => (typeof v === 'string' && timeRe.test(v) ? v : null);
const withSecs = (t) => (t && t.length === 5 ? `${t}:00` : t); // 'HH:MM' -> 'HH:MM:00'
// public.classes.end_time is NOT NULL, so derive a sensible end (+1h) when none.
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

const inList = (ids) => `(${ids.map((id) => encodeURIComponent(id)).join(',')})`;

async function readSettings() {
  const rows = await sb(`settings?id=eq.${SETTINGS_ID}&select=classTemplates,webClassSchedule&limit=1`);
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
  return {
    id: str(t.id, 60) || `template-${name.toLowerCase().replace(/\s+/g, '-')}`,
    name,
    description: str(t.description, 400),
    instructor: str(t.instructor, 80),
    color: str(t.color, 20),
    image: str(t.image, 600),
    start_time: reqTime(t.start_time),
    end_time: reqTime(t.end_time),
    max_capacity: Number.isFinite(+t.max_capacity) ? Math.max(0, Math.min(999, +t.max_capacity)) : 12,
  };
}

// Attach the materialised classes.id + capacity + registration count to each
// future entry, so the site can show "spaces left" and register against the
// right class. Registrant NAMES are never returned here — only counts.
async function enrichSchedule(schedule) {
  if (!schedule.length) return schedule;
  const today = new Date().toISOString().slice(0, 10);
  const gids = [...new Set(schedule.map((e) => e.recurrence_group_id).filter((g) => uuidRe.test(g)))];
  if (!gids.length) return schedule.map((e) => ({ ...e }));

  const rows = await sb(
    `classes?recurrence_group_id=in.${inList(gids)}&date=gte.${today}&select=id,recurrence_group_id,date,max_capacity`
  );
  const byKey = {};
  rows.forEach((r) => (byKey[`${r.recurrence_group_id}|${r.date}`] = r));

  const counts = {};
  const classIds = rows.map((r) => r.id);
  if (classIds.length) {
    const regs = await sb(`class_registrations?class_id=in.${inList(classIds)}&select=class_id,status`);
    (regs || []).forEach((r) => {
      if ((r.status || 'registered') !== 'cancelled') counts[r.class_id] = (counts[r.class_id] || 0) + 1;
    });
  }

  return schedule.map((e) => {
    const row = byKey[`${e.recurrence_group_id}|${e.date}`];
    if (!row) return { ...e };
    return { ...e, classId: row.id, capacity: row.max_capacity != null ? row.max_capacity : 12, registered: counts[row.id] || 0 };
  });
}

// A dated timetable entry.
function cleanEntry(s) {
  if (!s || typeof s !== 'object') return null;
  if (!dateRe.test(s.date)) return null;
  const start = reqTime(s.start_time);
  if (!start) return null;
  const gid = uuidRe.test(s.recurrence_group_id) ? s.recurrence_group_id : null;
  if (!gid) return null; // every entry carries a stable group id (made client-side)
  return {
    id: str(s.id, 60) || gid,
    date: s.date,
    templateId: str(s.templateId, 60),
    name: str(s.name, 80) || 'Class',
    start_time: start,
    end_time: reqTime(s.end_time),
    recurrence_group_id: gid,
  };
}

// Keep public.classes in sync with the dated timetable. Only rows whose
// recurrence_group_id belongs to a current or retired entry are touched, and a
// row with a member registration is never deleted.
async function materialise(entries, templates, retiredGroupIds) {
  const tById = {};
  templates.forEach((t) => (tById[t.id] = t));
  const today = new Date().toISOString().slice(0, 10);

  const activeGids = entries.map((e) => e.recurrence_group_id);
  const allGids = [...new Set([...activeGids, ...retiredGroupIds])];

  let existing = [];
  if (allGids.length) {
    existing = await sb(
      `classes?recurrence_group_id=in.${inList(allGids)}&date=gte.${today}` +
        `&select=id,date,name,start_time,end_time,recurrence_group_id`
    );
  }

  const reserved = new Set();
  if (existing.length) {
    const regs = await sb(`class_registrations?class_id=in.${inList(existing.map((r) => r.id))}&select=class_id`);
    (regs || []).forEach((r) => reserved.add(r.class_id));
  }

  const existingByGid = {};
  existing.forEach((r) => (existingByGid[r.recurrence_group_id] = existingByGid[r.recurrence_group_id] || []).push(r));

  const desiredGids = new Set();
  const toInsert = [];
  const toDelete = [];
  const updates = [];

  for (const e of entries) {
    if (e.date < today) continue; // never materialise the past
    desiredGids.add(e.recurrence_group_id);
    const tmpl = (e.templateId && tById[e.templateId]) || {};
    const name = e.name || tmpl.name || 'Class';
    const wantStart = withSecs(e.start_time);
    const wantEnd = resolveEnd(e.start_time, e.end_time);
    const rows = existingByGid[e.recurrence_group_id] || [];
    if (!rows.length) {
      toInsert.push({
        name,
        description: tmpl.description || null,
        instructor: tmpl.instructor || null,
        date: e.date,
        start_time: wantStart,
        end_time: wantEnd,
        max_capacity: tmpl.max_capacity != null ? tmpl.max_capacity : 12,
        recurrence_group_id: e.recurrence_group_id,
      });
    } else {
      const row = rows[0];
      if (row.date !== e.date || row.name !== name || row.start_time !== wantStart || row.end_time !== wantEnd) {
        updates.push({ id: row.id, patch: { date: e.date, name, start_time: wantStart, end_time: wantEnd } });
      }
      rows.slice(1).forEach((r) => {
        if (!reserved.has(r.id)) toDelete.push(r.id);
      });
    }
  }

  // Future rows whose group id is no longer wanted (entry removed/retired).
  Object.entries(existingByGid).forEach(([gid, rows]) => {
    if (!desiredGids.has(gid)) rows.forEach((r) => !reserved.has(r.id) && toDelete.push(r.id));
  });

  if (toDelete.length) await sb(`classes?id=in.${inList(toDelete)}`, { method: 'DELETE' });
  if (toInsert.length) await sb('classes', { method: 'POST', body: toInsert });
  for (const u of updates) await sb(`classes?id=eq.${u.id}`, { method: 'PATCH', body: u.patch });

  return { inserted: toInsert.length, updated: updates.length, deleted: toDelete.length };
}

// ---- handler ---------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method === 'GET') {
    if (!SERVICE_KEY) return res.status(200).json({ configured: false, templates: [], schedule: [] });
    try {
      const { templates, schedule } = await readSettings();
      const enriched = await enrichSchedule(schedule);
      // Short cache so "spaces left" stays close to real-time.
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=15, stale-while-revalidate=60');
      return res.status(200).json({ configured: true, templates, schedule: enriched });
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

  if (body.action === 'verify') return res.status(200).json({ ok });
  if (!ok) return res.status(401).json({ error: 'unauthorized' });
  if (!SERVICE_KEY) return res.status(503).json({ error: 'not_configured' });

  try {
    const prev = await readSettings();

    const templates = Array.isArray(body.templates)
      ? body.templates.map(cleanTemplate).filter(Boolean)
      : prev.templates;
    const schedule = Array.isArray(body.schedule)
      ? body.schedule.map(cleanEntry).filter(Boolean)
      : prev.schedule;

    await sb(`settings?id=eq.${SETTINGS_ID}`, {
      method: 'PATCH',
      body: { classTemplates: templates, webClassSchedule: schedule },
    });

    const activeIds = new Set(schedule.map((s) => s.recurrence_group_id));
    const retired = (prev.schedule || [])
      .map((s) => s.recurrence_group_id)
      .filter((gid) => uuidRe.test(gid) && !activeIds.has(gid));

    let materialised = { inserted: 0, updated: 0, deleted: 0 };
    try {
      materialised = await materialise(schedule, templates, [...new Set(retired)]);
    } catch (err) {
      console.error('classes materialise error:', err);
      return res.status(200).json({ ok: true, templates, schedule, materialised: null, warning: String(err.message || err) });
    }

    return res.status(200).json({ ok: true, templates, schedule, materialised });
  } catch (err) {
    console.error('classes POST error:', err);
    return res.status(500).json({ error: 'save_failed', message: String(err.message || err) });
  }
}
