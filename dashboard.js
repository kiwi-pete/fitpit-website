/* Fit Pit analytics dashboard — fetches /api/analytics and renders. */

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const COUNTRY_NAMES =
  typeof Intl !== 'undefined' && Intl.DisplayNames ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
const countryLabel = (code) => {
  if (!code) return '—';
  try {
    return (COUNTRY_NAMES && COUNTRY_NAMES.of(code)) || code;
  } catch {
    return code;
  }
};
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const fmt = (n) => (n || 0).toLocaleString('en-US');
const fmtTime = (secs) => {
  secs = Math.round(secs || 0);
  if (secs < 60) return secs + 's';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m + 'm ' + (s < 10 ? '0' : '') + s + 's';
};

const RANGE_LABELS = {
  '7d': 'last 7 days',
  '30d': 'last 30 days',
  '90d': 'last 90 days',
  '180d': 'last 180 days',
  '365d': 'last 365 days',
  this_year: 'this year',
  last_year: 'last year',
};

const SOURCE_META = {
  direct: { label: 'Direct', color: '#0f2330' },
  google: { label: 'Google', color: '#4285f4' },
  social: { label: 'Social Media', color: '#ff4d8d' },
  referral: { label: 'Referral', color: '#6c7bf7' },
  other: { label: 'Other', color: '#34c759' },
};
const DEVICE_COLORS = { mobile: '#0fb5ad', desktop: '#6c7bf7', tablet: '#f5a623' };

// SVG icons for the summary cards.
const ICONS = {
  visitors:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  views:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/></svg>',
  country:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18"/></svg>',
  devices:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
};

// ISO 3166-1 alpha-2 code -> flag emoji (regional indicator letters).
function flagEmoji(code) {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return '🏳️';
  const A = 0x1f1e6;
  const up = code.toUpperCase();
  return String.fromCodePoint(A + up.charCodeAt(0) - 65, A + up.charCodeAt(1) - 65);
}

// Build an SVG donut from [{label, value, color}].
function donutSVG(items, total, center, centerSub) {
  const size = 168,
    stroke = 24,
    r = (size - stroke) / 2,
    cx = size / 2,
    cy = size / 2;
  const C = 2 * Math.PI * r;
  let offset = 0;
  const ring = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#eef2f6" stroke-width="${stroke}" />`;
  const segs = items
    .filter((i) => i.value > 0)
    .map((i) => {
      const len = total ? (i.value / total) * C : 0;
      const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${i.color}" stroke-width="${stroke}" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})" stroke-linecap="butt" />`;
      offset += len;
      return seg;
    })
    .join('');
  const label =
    center != null
      ? `<text x="${cx}" y="${cy - 1}" text-anchor="middle" font-size="26" font-weight="800" fill="#0f2330">${esc(center)}</text>` +
        `<text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="11" fill="#9aa7b2">${esc(centerSub || '')}</text>`
      : '';
  return `<svg viewBox="0 0 ${size} ${size}" class="donut-svg" role="img">${ring}${segs}${label}</svg>`;
}

function donutLegend(items, total, showCount) {
  return (
    '<div class="donut-legend">' +
    items
      .map((i) => {
        const pct = total ? Math.round((i.value / total) * 100) : 0;
        return (
          `<div class="dl-row${showCount ? '' : ' no-count'}">` +
          `<span class="dl-dot" style="background:${i.color}"></span>` +
          `<span class="dl-label">${esc(i.label)}</span>` +
          `<span class="dl-pct">${pct}%</span>` +
          (showCount ? `<span class="dl-val">${fmt(i.value)}</span>` : '') +
          '</div>'
        );
      })
      .join('') +
    '</div>'
  );
}

let currentRange = '30d';
let dailyMode = 'bar';
let lastDaily = null;

async function load(rangeKey) {
  currentRange = rangeKey;
  setStatus('Loading…', 'info');
  try {
    const res = await fetch('/api/analytics?range=' + encodeURIComponent(rangeKey));
    const data = await res.json();
    if (data.configured === false) {
      setStatus(
        'Analytics storage is not configured yet. Set SUPABASE_SERVICE_ROLE_KEY in the Vercel project settings to start collecting and viewing data.',
        'info'
      );
      return;
    }
    if (!res.ok) throw new Error(data.message || 'Request failed');
    clearStatus();
    render(data);
  } catch (err) {
    setStatus('Could not load analytics: ' + err.message, '');
  }
}

function setStatus(msg, kind) {
  const s = $('#status');
  s.textContent = msg;
  s.className = 'status' + (kind ? ' ' + kind : '');
  s.hidden = false;
}
function clearStatus() {
  $('#status').hidden = true;
}

function render(d) {
  renderSummary(d.summary, d.countries);
  lastDaily = d.daily;
  renderDaily(d.daily);
  renderInterest(d.pageInterest);
  renderVBars('#time-bars', d.timeByPage.map((r) => ({ label: r.title, value: r.seconds })), fmtTime);
  renderBars('#countries-bars', d.countries.map((r) => ({ label: `${flagEmoji(r.key)} ${countryLabel(r.key)}`, value: r.count })));
  renderBars('#devices-bars', d.devices.map((r) => ({ label: cap(r.key), value: r.count })));
  renderBars('#browsers-bars', d.browsers.map((r) => ({ label: cap(r.key), value: r.count })));
  renderBars('#screens-bars', d.screens.map((r) => ({ label: screenLabel(r.key), value: r.count })));
  renderBars('#toppages-bars', d.topPages.map((r) => ({ label: r.title, value: r.count })));
  renderSourcesDonut(d.sources);
  renderCampaigns(d.campaigns);
  renderCta(d.ctaClicks);
  renderOutbound(d.outboundClicks);
  renderVitals(d.webVitals);
}

function screenLabel(k) {
  return (
    { 'small-mobile': 'Small mobile', tablet: 'Tablet', desktop: 'Desktop', 'large-desktop': 'Large desktop' }[k] ||
    cap(k)
  );
}

function metricCard(icon, label, value, sub) {
  const n = el('div', 'metric');
  n.innerHTML =
    `<div class="metric-top">${ICONS[icon] || ''}<span class="label">${esc(label)}</span></div>` +
    `<div class="value">${esc(value)}</div>` +
    `<div class="sub">${esc(sub || '')}</div>`;
  return n;
}

function renderSummary(s, countries) {
  const wrap = $('#summary-cards');
  wrap.innerHTML = '';
  const rangeLabel = RANGE_LABELS[currentRange] || '';
  const topCount = (countries && countries[0] && countries[0].count) || 0;

  wrap.append(metricCard('visitors', 'Visitors', fmt(s.visitors), rangeLabel));
  wrap.append(metricCard('views', 'Page views', fmt(s.pageViews), rangeLabel));
  wrap.append(
    metricCard(
      'country',
      'Top country',
      `${flagEmoji(s.topCountry)} ${countryLabel(s.topCountry)}`,
      topCount ? `${fmt(topCount)} visitor${topCount === 1 ? '' : 's'}` : ''
    )
  );

  // Devices card with mini donut + legend
  const devs = s.devices || [];
  const total = devs.reduce((a, b) => a + b.count, 0);
  const items = devs.map((x) => ({ label: cap(x.key), value: x.count, color: DEVICE_COLORS[x.key] || '#9aa7b2' }));
  const dev = el('div', 'metric donut-card');
  if (total > 0) {
    dev.innerHTML =
      `<div class="metric-top">${ICONS.devices}<span class="label">Devices</span></div>` +
      `<div class="donut-mini">${donutSVG(items, total, fmt(total), 'sessions')}${donutLegend(items, total, false)}</div>`;
  } else {
    dev.innerHTML =
      `<div class="metric-top">${ICONS.devices}<span class="label">Devices</span></div>` +
      `<div class="value" style="font-size:1rem;color:var(--ink-soft)">Collecting…</div>`;
  }
  wrap.append(dev);
}

function renderSourcesDonut(sources) {
  const host = $('#sources-donut');
  const items = (sources || []).map((s) => {
    const meta = SOURCE_META[s.key] || { label: cap(s.key), color: '#9aa7b2' };
    return { label: meta.label, value: s.count, color: meta.color };
  });
  const total = items.reduce((a, b) => a + b.value, 0);
  if (!total) {
    host.innerHTML = '<div class="empty">Collecting data…</div>';
    return;
  }
  host.innerHTML = donutSVG(items, total, fmt(total), 'visitors') + donutLegend(items, total, true);
}

function renderDaily(daily) {
  const host = $('#daily-chart');
  host.innerHTML = '';
  if (!daily || !daily.length) {
    host.append(el('div', 'empty', 'No visits in this period yet.'));
    return;
  }
  if (dailyMode === 'line') renderDailyLine(host, daily);
  else renderDailyBars(host, daily);
}

function renderDailyBars(host, daily) {
  const W = 1000,
    H = 240,
    pad = { l: 10, r: 10, t: 16, b: 26 };
  const n = daily.length;
  const maxV = Math.max(1, ...daily.map((d) => d.pageViews));
  const innerW = W - pad.l - pad.r;
  const slot = innerW / n;
  const bw = Math.min(36, slot * 0.62);
  const baseY = H - pad.b;
  const h = (v) => (v / maxV) * (H - pad.t - pad.b);

  const bars = daily
    .map((d, i) => {
      const cx = pad.l + slot * i + slot / 2;
      const x = (cx - bw / 2).toFixed(1);
      const pvH = h(d.pageViews);
      const uH = h(d.visitors);
      const w = bw.toFixed(1);
      const tip = `${d.day} — ${fmt(d.pageViews)} views, ${fmt(d.visitors)} unique`;
      const rx = Math.min(4, bw / 3).toFixed(1);
      // teal column (page views), then dark base (unique visitors) drawn over the bottom
      return (
        `<g><title>${esc(tip)}</title>` +
        (d.pageViews > 0
          ? `<rect x="${x}" y="${(baseY - pvH).toFixed(1)}" width="${w}" height="${pvH.toFixed(1)}" rx="${rx}" fill="#0fb5ad" />`
          : '') +
        (d.visitors > 0
          ? `<rect x="${x}" y="${(baseY - uH).toFixed(1)}" width="${w}" height="${uH.toFixed(1)}" rx="${rx}" fill="#0f2330" />`
          : '') +
        '</g>'
      );
    })
    .join('');

  const ends =
    `<text x="${pad.l}" y="${H - 6}" font-size="10" fill="#9aa7b2" text-anchor="start">${daily[0].day}</text>` +
    (n > 1
      ? `<text x="${W - pad.r}" y="${H - 6}" font-size="10" fill="#9aa7b2" text-anchor="end">${daily[n - 1].day}</text>`
      : '');

  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Daily visits chart">
    <line x1="${pad.l}" y1="${baseY}" x2="${W - pad.r}" y2="${baseY}" stroke="#eef2f6" />
    ${bars}
    ${ends}
  </svg>`;
}

function renderDailyLine(host, daily) {
  const W = 1000,
    H = 240,
    pad = { l: 36, r: 12, t: 14, b: 26 };
  const maxV = Math.max(1, ...daily.map((d) => Math.max(d.pageViews, d.visitors)));
  const n = daily.length;
  const x = (i) => pad.l + (n === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (n - 1));
  const y = (v) => pad.t + (1 - v / maxV) * (H - pad.t - pad.b);
  const line = (key) => daily.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');
  const area = (key) =>
    `${line(key)} L${x(n - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;

  const gridY = [0, 0.5, 1]
    .map((t) => {
      const yy = pad.t + t * (H - pad.t - pad.b);
      const val = Math.round(maxV * (1 - t));
      return `<line x1="${pad.l}" y1="${yy}" x2="${W - pad.r}" y2="${yy}" stroke="#eef2f6" />
            <text x="4" y="${yy + 4}" font-size="11" fill="#9aa7b2">${val}</text>`;
    })
    .join('');

  const step = Math.ceil(n / 8);
  const labels = daily
    .map((d, i) =>
      i % step === 0 || i === n - 1
        ? `<text x="${x(i).toFixed(1)}" y="${H - 6}" font-size="10" fill="#9aa7b2" text-anchor="middle">${d.day.slice(5)}</text>`
        : ''
    )
    .join('');

  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Daily visits chart">
    ${gridY}
    <path d="${area('pageViews')}" fill="rgba(15,181,173,0.12)" stroke="none" />
    <path d="${line('pageViews')}" fill="none" stroke="#0fb5ad" stroke-width="2.5" stroke-linejoin="round" />
    <path d="${line('visitors')}" fill="none" stroke="#0f2330" stroke-width="2.5" stroke-linejoin="round" />
    ${labels}
  </svg>`;
}

function renderVBars(sel, items, format) {
  const host = $(sel);
  host.innerHTML = '';
  if (!items || !items.length) {
    host.append(el('div', 'empty', 'Collecting data…'));
    return;
  }
  const max = Math.max(1, ...items.map((i) => i.value));
  const wrap = el('div', 'vbars');
  items.slice(0, 10).forEach((i) => {
    const pct = Math.max(2, (i.value / max) * 100);
    const valTxt = format ? format(i.value) : fmt(i.value);
    const col = el('div', 'vbar');
    col.innerHTML =
      `<div class="vbar-tip">${esc(i.label)} · ${esc(valTxt)}</div>` +
      `<div class="vbar-label">${esc(i.label)}</div>` +
      `<div class="vbar-bar"><div class="vbar-fill" style="height:${pct}%"></div></div>` +
      `<div class="vbar-val">${esc(valTxt)}</div>`;
    wrap.append(col);
  });
  host.append(wrap);
}

function barRows(host, items, format) {
  host.innerHTML = '';
  if (!items || !items.length) {
    host.append(el('div', 'empty', 'No data yet.'));
    return;
  }
  const max = Math.max(1, ...items.map((i) => i.value));
  items.slice(0, 12).forEach((i) => {
    const row = el('div', 'bar-row');
    row.append(el('div', 'bl', esc(i.label)));
    const track = el('div', 'bar-track');
    const fill = el('div', 'bar-fill');
    fill.style.width = Math.max(2, (i.value / max) * 100) + '%';
    track.append(fill);
    row.append(track, el('div', 'bv', esc(format ? format(i.value) : fmt(i.value))));
    host.append(row);
  });
}
function renderBars(sel, items, format) {
  barRows($(sel), items, format);
}

function renderInterest(rows) {
  const tb = $('#interest-table tbody');
  tb.innerHTML = '';
  if (!rows || !rows.length) {
    tb.append(el('tr', '', '<td colspan="5" class="empty">No page activity yet.</td>'));
    return;
  }
  rows.forEach((r) => {
    const tr = el('tr');
    tr.innerHTML = `<td>${esc(r.title)}</td>
      <td>${fmt(r.views)}</td>
      <td>${fmtTime(r.avgTime)}</td>
      <td>${fmt(r.enquiryStarts)}</td>
      <td class="${r.converted > 0 ? 'converted-pos' : ''}">${fmt(r.converted)}</td>`;
    tb.append(tr);
  });
}

function renderCampaigns(rows) {
  const tb = $('#campaign-table tbody');
  tb.innerHTML = '';
  if (!rows || !rows.length) {
    tb.append(el('tr', '', '<td colspan="4" class="empty">No campaign or referral traffic in this period.</td>'));
    return;
  }
  rows.forEach((r) => {
    const tr = el('tr');
    tr.innerHTML = `<td>${esc(r.source)}</td><td>${esc(r.medium)}</td><td>${esc(r.campaign)}</td><td><span class="pill">${fmt(r.visitors)}</span></td>`;
    tb.append(tr);
  });
}

function renderCta(rows) {
  const tb = $('#cta-table tbody');
  tb.innerHTML = '';
  if (!rows || !rows.length) {
    tb.append(el('tr', '', '<td colspan="3" class="empty">No CTA clicks yet.</td>'));
    return;
  }
  rows.slice(0, 25).forEach((r) => {
    const tr = el('tr');
    tr.innerHTML = `<td>${esc(r.label)}</td><td>${esc(r.title)}</td><td><span class="pill">${fmt(r.count)}</span></td>`;
    tb.append(tr);
  });
}

function renderOutbound(rows) {
  const tb = $('#outbound-table tbody');
  tb.innerHTML = '';
  if (!rows || !rows.length) {
    tb.append(el('tr', '', '<td colspan="3" class="empty">No outbound clicks yet.</td>'));
    return;
  }
  rows.slice(0, 25).forEach((r) => {
    const label = r.type && r.type !== r.label ? `${r.label} (${cap(r.type)})` : r.label;
    const tr = el('tr');
    tr.innerHTML = `<td>${esc(label)}</td><td>${esc(r.title)}</td><td><span class="pill">${fmt(r.count)}</span></td>`;
    tb.append(tr);
  });
}

const VITAL_META = {
  LCP: { unit: 'ms', asSec: true, good: 2500, warn: 4000 },
  FCP: { unit: 'ms', asSec: true, good: 1800, warn: 3000 },
  CLS: { unit: '', asSec: false, good: 0.1, warn: 0.25 },
  INP: { unit: 'ms', asSec: false, good: 200, warn: 500 },
  TTFB: { unit: 'ms', asSec: false, good: 800, warn: 1800 },
};
function renderVitals(rows) {
  const host = $('#vitals');
  host.innerHTML = '';
  rows.forEach((r) => {
    const meta = VITAL_META[r.metric] || {};
    let cls = 'none',
      display = 'Collecting…';
    if (r.median != null) {
      if (r.median <= meta.good) cls = 'good';
      else if (r.median <= meta.warn) cls = 'warn';
      else cls = 'bad';
      if (r.metric === 'CLS') display = r.median.toFixed(2);
      else if (meta.asSec && r.median >= 1000) display = (r.median / 1000).toFixed(2) + 's';
      else display = Math.round(r.median) + (meta.unit || '');
    }
    const card = el('div', 'vital ' + cls);
    card.append(el('div', 'vm', esc(r.metric)));
    card.append(el('div', 'vv', esc(display)));
    card.append(el('div', 'vs', r.samples ? `${fmt(r.samples)} samples` : 'no data'));
    host.append(card);
  });
}

// Initialised lazily by the admin shell the first time the Analytics tab is
// opened, so no analytics request fires while the operator is in Class Admin.
let analyticsStarted = false;
export function initAnalytics() {
  if (analyticsStarted) return;
  analyticsStarted = true;

  $('#ranges').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-range]');
    if (!btn) return;
    document.querySelectorAll('#ranges button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    load(btn.dataset.range);
  });

  const refresh = $('#refresh-btn');
  if (refresh) {
    refresh.addEventListener('click', () => {
      refresh.classList.add('spinning');
      load(currentRange).finally(() => setTimeout(() => refresh.classList.remove('spinning'), 400));
    });
  }

  const toggle = $('#daily-toggle');
  if (toggle) {
    toggle.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-mode]');
      if (!btn || btn.dataset.mode === dailyMode) return;
      dailyMode = btn.dataset.mode;
      toggle.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
      if (lastDaily) renderDaily(lastDaily);
    });
  }

  load('30d');
}
