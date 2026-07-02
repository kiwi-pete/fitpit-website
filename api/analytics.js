/* ============================================================
   Fit Pit analytics — dashboard data API
   ------------------------------------------------------------
   Reads anonymous analytics from Supabase (service-role key,
   server-side only) and returns aggregated JSON for the hidden
   /secretadminlink dashboard. No personal data is involved.

   GET /api/analytics?range=7d|30d|90d|180d|365d|this_year|last_year
   ============================================================ */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lnxzqiydnpshaooflebs.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PAGE = 1000;

function range(key) {
  const now = new Date();
  const end = new Date(now);
  let start = new Date(now);
  const day = 86400000;
  switch (key) {
    case '7d': start = new Date(now - 7 * day); break;
    case '90d': start = new Date(now - 90 * day); break;
    case '180d': start = new Date(now - 180 * day); break;
    case '365d': start = new Date(now - 365 * day); break;
    case 'this_year': start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)); break;
    case 'last_year':
      return {
        from: new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1)),
        to: new Date(Date.UTC(now.getUTCFullYear() - 1, 11, 31, 23, 59, 59)),
      };
    case '30d':
    default: start = new Date(now - 30 * day); break;
  }
  return { from: start, to: end };
}

async function fetchAll(table, columns, fromISO, toISO) {
  const rows = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url =
      `${SUPABASE_URL}/rest/v1/${table}` +
      `?select=${encodeURIComponent(columns)}` +
      `&created_at=gte.${encodeURIComponent(fromISO)}` +
      `&created_at=lte.${encodeURIComponent(toISO)}` +
      `&order=created_at.asc`;
    const res = await fetch(url, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Range: `${offset}-${offset + PAGE - 1}`,
        'Range-Unit': 'items',
      },
    });
    if (!res.ok) throw new Error(`${table} read failed (${res.status}): ${await res.text()}`);
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
    if (offset > 200000) break; // safety
  }
  return rows;
}

// All admin-device (excluded) session ids, across all time. Small set (only the
// operators' own devices), fetched once per dashboard load so exclusion holds
// even at date-range boundaries. Throws if the `excluded` column doesn't exist
// yet (pre-migration) — the caller treats that as "exclude nothing".
async function fetchExcludedSessionIds() {
  const ids = new Set();
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/analytics_sessions?select=id&excluded=is.true&order=id.asc`;
    const res = await fetch(url, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Range: `${offset}-${offset + PAGE - 1}`,
        'Range-Unit': 'items',
      },
    });
    if (!res.ok) throw new Error(`excluded ids read failed (${res.status}): ${await res.text()}`);
    const batch = await res.json();
    batch.forEach((r) => r && r.id && ids.add(r.id));
    if (batch.length < PAGE) break;
    offset += PAGE;
    if (offset > 200000) break; // safety
  }
  return ids;
}

const PAGE_TITLES = {
  home: 'Home',
  passes: 'Memberships & Passes',
  'personal-training': 'Personal Training',
  classes: 'Classes',
  facility: 'Facility',
  about: 'About',
  shop: 'Shop',
  clinic: 'Medical Clinic',
  contact: 'Contact',
};

function inc(map, key, by = 1) {
  if (key == null || key === '') return;
  map[key] = (map[key] || 0) + by;
}
function toSorted(map) {
  return Object.entries(map)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}
function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function dayKey(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}
function capWord(x) {
  return x ? x.charAt(0).toUpperCase() + x.slice(1) : x;
}

// Best-guess Apple model from logical screen size + DPR. Apple never exposes the
// real model in the browser, so this is a heuristic: several models share a
// screen size and can't be told apart, and it's always shown labelled "(likely)".
// Portrait-normalised (w = short side, h = long side).
const APPLE_SCREENS = {
  '320x568x2': 'iPhone SE / 5S',
  '375x667x2': 'iPhone 6/7/8 / SE 2–3',
  '414x736x3': 'iPhone 6/7/8 Plus',
  '360x780x3': 'iPhone 12/13 mini',
  '375x812x3': 'iPhone X / XS / 11 Pro',
  '414x896x2': 'iPhone XR / 11',
  '414x896x3': 'iPhone XS Max / 11 Pro Max',
  '390x844x3': 'iPhone 12 / 13 / 14',
  '428x926x3': 'iPhone 12–14 Pro Max / 14 Plus',
  '393x852x3': 'iPhone 14 Pro / 15 / 16',
  '430x932x3': 'iPhone 15 Plus / 15 Pro Max / 16 Plus',
  '402x874x3': 'iPhone 16 Pro',
  '440x956x3': 'iPhone 16 Pro Max',
  '768x1024x2': 'iPad 9.7"',
  '810x1080x2': 'iPad 10.2"',
  '820x1180x2': 'iPad Air / iPad 10.9"',
  '834x1112x2': 'iPad Air / Pro 10.5"',
  '834x1194x2': 'iPad Pro 11"',
  '1024x1366x2': 'iPad Pro 12.9"',
};
function appleModel(s) {
  const a = s.screen_w || 0;
  const b = s.screen_h || 0;
  if (!a || !b) return null;
  const w = Math.min(a, b);
  const h = Math.max(a, b);
  const dpr = Math.round(s.dpr || 0);
  return APPLE_SCREENS[`${w}x${h}x${dpr}`] || null;
}
// Human-friendly model label. Real hardware model when available (Android), else
// a best-guess for Apple, else a generic OS + form-factor label.
function displayModel(s) {
  if (s.device_model) return s.device_model; // real model (Android via Client Hints)
  const os = s.os || '';
  if (os === 'iOS') {
    const g = appleModel(s);
    if (g) return g + ' (likely)';
    return s.device_type === 'tablet' ? 'iPad' : 'iPhone';
  }
  if (os === 'Android') return 'Android ' + (s.device_type || 'device');
  if (os === 'macOS') return 'Mac';
  if (os === 'Windows') return 'Windows PC';
  if (os && os !== 'Other') return os + (s.device_type ? ' ' + s.device_type : '');
  return capWord(s.device_type || 'Device');
}
function resLabel(s) {
  if (!s.screen_w || !s.screen_h) return null;
  return `${s.screen_w}×${s.screen_h}${s.dpr ? ` @${s.dpr}×` : ''}`;
}

export default async function handler(req, res) {
  if (!SERVICE_KEY) {
    return res.status(200).json({ configured: false });
  }
  try {
    const key = String((req.query && req.query.range) || '30d');
    // 'public' (default) hides admin-device visits; 'admin' shows ONLY them, so
    // the operator can confirm their own devices are being excluded.
    const scope = String((req.query && req.query.scope) || 'public') === 'admin' ? 'admin' : 'public';
    const { from, to } = range(key);
    const fromISO = from.toISOString();
    const toISO = to.toISOString();

    // The extended columns (device detail + geo + excluded) are added by the
    // analytics detail migration. If it hasn't been run yet, the extended select
    // 400s, so we fall back to the base columns and the dashboard still works.
    const SESS_BASE =
      'created_at,visitor_hash,referrer_domain,utm_source,utm_medium,utm_campaign,source_group,device_type,browser,screen_bucket,country';
    const SESS_EXT =
      SESS_BASE +
      ',id,os,os_version,browser_version,device_model,screen_w,screen_h,dpr,city,region,latitude,longitude,excluded';
    const sessionsF = (async () => {
      try {
        return await fetchAll('analytics_sessions', SESS_EXT, fromISO, toISO);
      } catch (e) {
        console.warn('Analytics: extended session select failed, falling back to base columns:', e.message);
        return await fetchAll('analytics_sessions', SESS_BASE, fromISO, toISO);
      }
    })();

    const [allSessions, allPageViews, allEvents, allVitals] = await Promise.all([
      sessionsF,
      fetchAll('analytics_page_views', 'created_at,session_id,visitor_hash,page,title', fromISO, toISO),
      fetchAll('analytics_events', 'created_at,session_id,visitor_hash,type,page,label,detail,value', fromISO, toISO),
      fetchAll('analytics_web_vitals', 'created_at,session_id,metric,value', fromISO, toISO),
    ]);

    // Split admin-device (excluded) sessions from the rest so their visits never
    // contribute to ANY metric in the default view. The set of admin session ids
    // is fetched across ALL TIME (not just this range) so page views/events whose
    // session started just outside the window are still caught — exclusion is
    // absolute. Pre-migration (no `excluded` column) the fetch fails and the set
    // is empty, so everything shows as public — safe default.
    let excludedIds;
    try {
      excludedIds = await fetchExcludedSessionIds();
    } catch (e) {
      console.warn('Analytics: excluded-id fetch failed (migration not run yet?), excluding nothing:', e.message);
      excludedIds = new Set();
    }
    // Count of admin-device sessions that fall within the selected range (for the
    // dashboard's "N sessions excluded in this period" note).
    const excludedCount = allSessions.filter((s) => s.excluded || excludedIds.has(s.id)).length;
    const keep = (sid) => (scope === 'admin' ? excludedIds.has(sid) : !excludedIds.has(sid));
    const sessions = allSessions.filter((s) => keep(s.id));
    const pageViews = allPageViews.filter((p) => keep(p.session_id));
    const events = allEvents.filter((e) => keep(e.session_id));
    const vitals = allVitals.filter((v) => keep(v.session_id));

    // ---- visitors / page views ----
    const visitorSet = new Set();
    pageViews.forEach((p) => p.visitor_hash && visitorSet.add(p.visitor_hash));
    sessions.forEach((s) => s.visitor_hash && visitorSet.add(s.visitor_hash));

    // ---- daily series ----
    const dailyPV = {};
    const dailyVisitors = {}; // day -> Set
    pageViews.forEach((p) => {
      const d = dayKey(p.created_at);
      inc(dailyPV, d);
      (dailyVisitors[d] = dailyVisitors[d] || new Set()).add(p.visitor_hash);
    });
    const days = Object.keys(dailyPV).sort();
    const daily = days.map((d) => ({
      day: d,
      pageViews: dailyPV[d] || 0,
      visitors: (dailyVisitors[d] && dailyVisitors[d].size) || 0,
    }));

    // ---- top pages / page interest ----
    const pvByPage = {};
    pageViews.forEach((p) => inc(pvByPage, p.page || 'home'));

    const enquiriesByPage = {};
    const conversionsByPage = {};
    const ctaMap = {}; // `${label}|||${page}` -> count
    const outboundMap = {}; // `${label}|||${detail}|||${page}` -> count
    const timeSessionPage = {}; // `${session}|||${page}` -> seconds
    const timeByPageTotal = {};

    events.forEach((e) => {
      const page = e.page || 'home';
      if (e.type === 'enquiry_start') inc(enquiriesByPage, page);
      else if (e.type === 'conversion') inc(conversionsByPage, page);
      else if (e.type === 'cta_click') inc(ctaMap, `${e.label || 'CTA'}|||${page}`);
      else if (e.type === 'outbound_click')
        inc(outboundMap, `${e.label || e.detail || 'link'}|||${e.detail || 'external'}|||${page}`);
      else if (e.type === 'active_time' && typeof e.value === 'number') {
        inc(timeByPageTotal, page, e.value);
        inc(timeSessionPage, `${e.session_id}|||${page}`, e.value);
      }
    });

    // avg active time per visitor per page
    const timeAgg = {}; // page -> {total, sessions}
    Object.entries(timeSessionPage).forEach(([k, secs]) => {
      const page = k.split('|||')[1];
      (timeAgg[page] = timeAgg[page] || { total: 0, sessions: 0 }).total += secs;
      timeAgg[page].sessions += 1;
    });

    const allPageKeys = new Set([
      ...Object.keys(pvByPage),
      ...Object.keys(timeByPageTotal),
      ...Object.keys(enquiriesByPage),
      ...Object.keys(conversionsByPage),
    ]);
    const pageInterest = [...allPageKeys]
      .map((p) => {
        const agg = timeAgg[p];
        return {
          page: p,
          title: PAGE_TITLES[p] || p,
          views: pvByPage[p] || 0,
          avgTime: agg && agg.sessions ? Math.round(agg.total / agg.sessions) : 0,
          enquiryStarts: enquiriesByPage[p] || 0,
          converted: conversionsByPage[p] || 0,
        };
      })
      .sort((a, b) => b.views - a.views);

    const timeByPage = Object.entries(timeByPageTotal)
      .map(([p, secs]) => ({ page: p, title: PAGE_TITLES[p] || p, seconds: Math.round(secs) }))
      .sort((a, b) => b.seconds - a.seconds);

    const topPages = Object.entries(pvByPage)
      .map(([p, count]) => ({ page: p, title: PAGE_TITLES[p] || p, count }))
      .sort((a, b) => b.count - a.count);

    // ---- session-derived breakdowns ----
    const devices = {};
    const browsers = {};
    const countries = {};
    const sources = {};
    const screens = {};
    const campaignMap = {}; // key -> Set(visitor)
    sessions.forEach((s) => {
      inc(devices, s.device_type || 'desktop');
      inc(browsers, s.browser || 'other');
      if (s.country) inc(countries, s.country);
      inc(sources, s.source_group || 'direct');
      inc(screens, s.screen_bucket || 'desktop');

      const hasUtm = s.utm_source || s.utm_medium || s.utm_campaign;
      let src, med, camp;
      if (hasUtm) {
        src = s.utm_source || '(not set)';
        med = s.utm_medium || '—';
        camp = s.utm_campaign || '—';
      } else if (s.referrer_domain) {
        src = s.referrer_domain;
        med = '—';
        camp = '—';
      } else {
        return; // direct, no campaign attribution
      }
      const ck = `${src}|||${med}|||${camp}`;
      (campaignMap[ck] = campaignMap[ck] || new Set()).add(s.visitor_hash || Math.random());
    });

    // ---- detailed device breakdown (model / OS+ver / browser+ver / resolution) ----
    const ddMap = {};
    // ---- precise locations (city-level, from Vercel edge geo) ----
    const locMap = {};
    sessions.forEach((s) => {
      const model = displayModel(s);
      const osStr = s.os ? s.os + (s.os_version ? ' ' + s.os_version : '') : '—';
      const brStr = (s.browser ? capWord(s.browser) : '—') + (s.browser_version ? ' ' + s.browser_version : '');
      const resStr = resLabel(s) || '—';
      const dk = [model, osStr, brStr, resStr, s.device_type || ''].join('|||');
      (ddMap[dk] = ddMap[dk] || {
        model,
        os: osStr,
        browser: brStr,
        resolution: resStr,
        deviceType: s.device_type || '',
        count: 0,
      }).count++;

      if (s.latitude != null && s.longitude != null) {
        const lk = [s.city || '', s.region || '', s.country || ''].join('|||');
        (locMap[lk] = locMap[lk] || {
          city: s.city || null,
          region: s.region || null,
          country: s.country || null,
          lat: s.latitude,
          lon: s.longitude,
          count: 0,
        }).count++;
      }
    });
    const deviceDetails = Object.values(ddMap).sort((a, b) => b.count - a.count);
    const locations = Object.values(locMap).sort((a, b) => b.count - a.count);

    const campaigns = Object.entries(campaignMap)
      .map(([k, set]) => {
        const [source, medium, campaign] = k.split('|||');
        return { source, medium, campaign, visitors: set.size };
      })
      .sort((a, b) => b.visitors - a.visitors);

    const ctaClicks = Object.entries(ctaMap)
      .map(([k, count]) => {
        const [label, page] = k.split('|||');
        return { label, page, title: PAGE_TITLES[page] || page, count };
      })
      .sort((a, b) => b.count - a.count);

    const outboundClicks = Object.entries(outboundMap)
      .map(([k, count]) => {
        const [label, type, page] = k.split('|||');
        return { label, type, page, title: PAGE_TITLES[page] || page, count };
      })
      .sort((a, b) => b.count - a.count);

    // ---- web vitals medians ----
    const vGroups = {};
    vitals.forEach((v) => {
      if (typeof v.value === 'number') (vGroups[v.metric] = vGroups[v.metric] || []).push(v.value);
    });
    const webVitals = ['LCP', 'FCP', 'CLS', 'INP', 'TTFB'].map((m) => ({
      metric: m,
      median: vGroups[m] ? Math.round(median(vGroups[m]) * 100) / 100 : null,
      samples: vGroups[m] ? vGroups[m].length : 0,
    }));

    const countriesArr = toSorted(countries);
    const topCountry = countriesArr.length ? countriesArr[0].key : '—';

    return res.status(200).json({
      configured: true,
      range: key,
      scope,
      excludedCount,
      from: fromISO,
      to: toISO,
      summary: {
        visitors: visitorSet.size,
        pageViews: pageViews.length,
        sessions: sessions.length,
        topCountry,
        devices: toSorted(devices),
      },
      daily,
      pageInterest,
      timeByPage,
      countries: countriesArr,
      locations,
      devices: toSorted(devices),
      deviceDetails,
      browsers: toSorted(browsers),
      topPages,
      sources: toSorted(sources),
      screens: toSorted(screens),
      campaigns,
      ctaClicks,
      outboundClicks,
      webVitals,
    });
  } catch (err) {
    console.error('Analytics aggregation error:', err);
    return res.status(500).json({ error: 'aggregation_failed', message: String(err.message || err) });
  }
}
