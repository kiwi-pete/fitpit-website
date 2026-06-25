/* ============================================================
   Fit Pit — website content overrides API
   ------------------------------------------------------------
   Backs the WYSIWYG "Website Content" editor in the admin. The
   public marketing copy + photos live hardcoded in index.html as
   defaults; this endpoint stores per-element OVERRIDES keyed by the
   element's `data-edit` / `data-edit-img` attribute. The public site
   (main.js applyContentOverrides) fetches these on load and applies
   them, so the owner can edit text/images with no rebuild or deploy.

   - GET  /api/content   → public. Returns { text, images } override maps.
   - POST /api/content   → PIN-gated. Saves the override maps.

   Stored in the dedicated public.web_site_content table (single row
   id='global') in the shared "Gym Manager" Supabase project — kept
   separate from the ops `settings` row so a content save can never
   touch class/roster data. Service-role key, server-side only.

   Env:
     SUPABASE_SERVICE_ROLE_KEY   (required for any data access)
     SUPABASE_URL                (optional; defaults to the project URL)
     CLASS_ADMIN_PIN             (optional; defaults to '2026')
   ============================================================ */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lnxzqiydnpshaooflebs.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ADMIN_PIN = process.env.CLASS_ADMIN_PIN || '2026';
const ROW_ID = 'global';

// Public Storage prefix that api/upload.js returns — images may only point here.
const IMG_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/gym-manager/`;

const MAX_KEYS = 400; // text entries
const MAX_IMG_KEYS = 50;
const MAX_KEY_LEN = 120;
const MAX_VAL_LEN = 5000;
const MAX_CARDS = 24;
const CARD_ICONS = new Set(['bolt', 'clock', 'bars', 'dumbbell']);
const isBucketUrl = (v) => typeof v === 'string' && v.length <= 600 && v.startsWith(IMG_PREFIX);

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

async function readContent() {
  const rows = await sb(`web_site_content?id=eq.${ROW_ID}&select=text,images,collections&limit=1`);
  const row = (rows && rows[0]) || {};
  return {
    text: row.text && typeof row.text === 'object' ? row.text : {},
    images: row.images && typeof row.images === 'object' ? row.images : {},
    collections: row.collections && typeof row.collections === 'object' ? row.collections : {},
  };
}

// Keep only well-formed string entries within the size caps.
function cleanText(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  let n = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (n >= MAX_KEYS) break;
    if (typeof k !== 'string' || !k.length || k.length > MAX_KEY_LEN) continue;
    if (typeof v !== 'string') continue;
    out[k] = v.slice(0, MAX_VAL_LEN);
    n++;
  }
  return out;
}

function cleanImages(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  let n = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (n >= MAX_IMG_KEYS) break;
    if (typeof k !== 'string' || !k.length || k.length > MAX_KEY_LEN) continue;
    if (typeof v !== 'string' || v.length > 600) continue;
    if (!v.startsWith(IMG_PREFIX)) continue; // only our own uploaded images
    out[k] = v;
    n++;
  }
  return out;
}

// Repeatable collections (e.g. the Fitness Classes tiles). Only known shapes
// are accepted; image URLs must point at our own Storage bucket.
function cleanCard(c) {
  if (!c || typeof c !== 'object') return null;
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const card = {
    id: str(c.id, 60) || `c${Math.random().toString(36).slice(2, 9)}`,
    icon: CARD_ICONS.has(c.icon) ? c.icon : 'dumbbell',
    name: str(c.name, 80),
    trainer: str(c.trainer, 80),
    desc: str(c.desc, 600),
    image: isBucketUrl(c.image) ? c.image : '',
  };
  if (!card.name && !card.trainer && !card.desc && !card.image) return null; // drop empty
  return card;
}

function cleanCollections(obj) {
  const out = {};
  if (obj && typeof obj === 'object' && Array.isArray(obj.classCards)) {
    out.classCards = obj.classCards.slice(0, MAX_CARDS).map(cleanCard).filter(Boolean);
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    if (!SERVICE_KEY) return res.status(200).json({ configured: false, text: {}, images: {}, collections: {} });
    try {
      const { text, images, collections } = await readContent();
      // Edits must surface immediately across browsers/devices — no caching.
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ configured: true, text, images, collections });
    } catch (err) {
      console.error('content GET error:', err);
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
    // Only overwrite fields the caller actually sent; absent fields are kept as
    // they were (so a partial save can never wipe the others).
    const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
    const prev = await readContent();
    const text = has('text') ? cleanText(body.text) : prev.text;
    const images = has('images') ? cleanImages(body.images) : prev.images;
    const collections = has('collections') ? cleanCollections(body.collections) : prev.collections;
    await sb(`web_site_content?id=eq.${ROW_ID}`, {
      method: 'PATCH',
      body: { text, images, collections, updated_at: new Date().toISOString() },
    });
    return res.status(200).json({ ok: true, text, images, collections });
  } catch (err) {
    console.error('content POST error:', err);
    return res.status(500).json({ error: 'save_failed', message: String(err.message || err) });
  }
}
