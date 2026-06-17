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

export default async function handler(req, res) {
  if (!SERVICE_KEY) {
    return res.status(200).json({ configured: false });
  }
  try {
    const key = String((req.query && req.query.range) || '30d');
    const { from, to } = range(key);
    const fromISO = from.toISOString();
    const toISO = to.toISOString();

    const [sessions, pageViews, events, vitals] = await Promise.all([
      fetchAll(
        'analytics_sessions',
        'created_at,visitor_hash,referrer_domain,utm_source,utm_medium,utm_campaign,source_group,device_type,browser,screen_bucket,country',
        fromISO,
        toISO
      ),
      fetchAll('analytics_page_views', 'created_at,visitor_hash,page,title', fromISO, toISO),
      fetchAll('analytics_events', 'created_at,session_id,visitor_hash,type,page,label,detail,value', fromISO, toISO),
      fetchAll('analytics_web_vitals', 'created_at,metric,value', fromISO, toISO),
    ]);

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
      devices: toSorted(devices),
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
