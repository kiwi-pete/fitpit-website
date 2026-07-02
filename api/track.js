/* ============================================================
   Fit Pit analytics — ingestion endpoint
   ------------------------------------------------------------
   Receives batched, anonymous analytics from the public site
   and writes them to Supabase using the service-role key
   (server-side only). The browser never sees any key.

   Country is taken from the Vercel edge geo header
   (x-vercel-ip-country) — the raw IP is never read or stored.

   Required environment variable (set in Vercel project settings):
     SUPABASE_SERVICE_ROLE_KEY   (Gym Manager project service role key)
   Optional:
     SUPABASE_URL                (defaults to the known project URL)
   ============================================================ */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lnxzqiydnpshaooflebs.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const MAX_ROWS = 100; // per array, per request
const str = (v, n = 300) => (typeof v === 'string' && v.length ? v.slice(0, n) : null);
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function insert(table, rows) {
  if (!rows.length) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase insert into ${table} failed (${res.status}): ${body}`);
  }
}

export default async function handler(req, res) {
  // Never tracked from the admin page; CORS not needed (same origin).
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!SERVICE_KEY) {
    // Fail soft: don't error the client, just note it server-side.
    console.warn('Analytics: SUPABASE_SERVICE_ROLE_KEY not configured — event dropped.');
    return res.status(202).json({ ok: false, reason: 'not_configured' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'bad body' });

    const sessionId = uuidRe.test(body.session_id) ? body.session_id : null;
    const visitorHash = str(body.visitor_hash, 64);
    if (!sessionId) return res.status(400).json({ error: 'missing session_id' });

    const country =
      str(req.headers['x-vercel-ip-country'], 2) ||
      str(req.headers['x-country-code'], 2) ||
      null;

    // City-level location comes from Vercel's edge geo headers (derived from IP,
    // no browser permission prompt, no raw IP stored). City is URL-encoded by
    // Vercel (e.g. "New%20York"), so decode it. Accuracy is city-level only.
    const dec = (v, n = 120) => {
      const s = str(v, n);
      if (!s) return null;
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    };
    const fnum = (v) => {
      const n = parseFloat(str(v, 32));
      return isFinite(n) ? n : null;
    };
    const city = dec(req.headers['x-vercel-ip-city']);
    const region = dec(req.headers['x-vercel-ip-country-region'], 30);
    const latitude = fnum(req.headers['x-vercel-ip-latitude']);
    const longitude = fnum(req.headers['x-vercel-ip-longitude']);

    // ---- session (optional, sent once) ----
    if (body.session && typeof body.session === 'object') {
      const s = body.session;
      // Original columns — always present.
      const base = {
        id: sessionId,
        visitor_hash: visitorHash,
        referrer: str(s.referrer),
        referrer_domain: str(s.referrer_domain, 120),
        utm_source: str(s.utm_source, 120),
        utm_medium: str(s.utm_medium, 120),
        utm_campaign: str(s.utm_campaign, 120),
        source_group: str(s.source_group, 20),
        device_type: str(s.device_type, 20),
        browser: str(s.browser, 20),
        os: str(s.os, 20),
        screen_bucket: str(s.screen_bucket, 20),
        viewport_w: num(s.viewport_w),
        viewport_h: num(s.viewport_h),
        country: country || str(s.country, 2),
        landing_path: str(s.landing_path, 200),
      };
      // Extended columns — added by the analytics detail migration. If they
      // don't exist yet, we retry with just the base row so no session is lost.
      const full = {
        ...base,
        os_version: str(s.os_version, 20),
        browser_version: str(s.browser_version, 20),
        device_model: str(s.device_model, 60),
        screen_w: num(s.screen_w),
        screen_h: num(s.screen_h),
        dpr: num(s.dpr),
        city,
        region,
        latitude,
        longitude,
      };
      try {
        await insert('analytics_sessions', [full]);
      } catch (e) {
        console.warn('Analytics: extended session insert failed, retrying base columns:', e.message);
        await insert('analytics_sessions', [base]);
      }
    }

    // ---- page views ----
    if (Array.isArray(body.pageViews) && body.pageViews.length) {
      const rows = body.pageViews.slice(0, MAX_ROWS).map((p) => ({
        session_id: sessionId,
        visitor_hash: visitorHash,
        page: str(p.page, 60),
        title: str(p.title, 120),
        path: str(p.path, 200),
      }));
      await insert('analytics_page_views', rows);
    }

    // ---- events ----
    if (Array.isArray(body.events) && body.events.length) {
      const allowed = new Set([
        'session_start',
        'page_view',
        'active_time',
        'cta_click',
        'outbound_click',
        'enquiry_start',
        'conversion',
      ]);
      const rows = body.events
        .slice(0, MAX_ROWS)
        .filter((e) => e && allowed.has(e.type))
        .map((e) => ({
          session_id: sessionId,
          visitor_hash: visitorHash,
          type: str(e.type, 30),
          page: str(e.page, 60),
          label: str(e.label, 120),
          detail: str(e.detail, 120),
          value: num(e.value),
        }));
      await insert('analytics_events', rows);
    }

    // ---- web vitals ----
    if (Array.isArray(body.vitals) && body.vitals.length) {
      const allowed = new Set(['LCP', 'CLS', 'INP', 'FCP', 'TTFB']);
      const rows = body.vitals
        .slice(0, MAX_ROWS)
        .filter((v) => v && allowed.has(v.metric))
        .map((v) => ({
          session_id: sessionId,
          metric: str(v.metric, 10),
          value: num(v.value),
          page: str(v.page, 60),
        }));
      await insert('analytics_web_vitals', rows);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Analytics ingestion error:', err);
    return res.status(200).json({ ok: false }); // never break the client
  }
}
