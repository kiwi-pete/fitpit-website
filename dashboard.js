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
let lastData = null;

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
  lastData = d;
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

// Chart drawing surface (viewBox units). preserveAspectRatio="none" stretches
// the SVG to fill the container, so all TEXT is drawn as crisp HTML overlays
// (positioned by % across / px down) instead of stretched <text> nodes.
const CH_W = 1000;
const CH_H = 240;
const CH_PAD = { l: 48, r: 14, t: 14, b: 22 };

// Round a max value up to a clean axis top and return evenly spaced integer ticks.
function niceScale(maxRaw, tickCount) {
  tickCount = tickCount || 4;
  const max = Math.max(1, Math.ceil(maxRaw));
  const rawStep = max / tickCount;
  const pow = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const cand = [1, 2, 2.5, 5, 10].map((m) => m * pow);
  let step = cand.find((s) => s >= rawStep - 1e-9) || cand[cand.length - 1];
  step = Math.max(1, Math.round(step)); // visit counts are integers → integer ticks
  const niceMax = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= niceMax + 1e-9; v += step) ticks.push(v);
  return { niceMax, ticks };
}

// HTML overlay: Y-axis numbers down the left gutter.
function chartYLabels(pad, ticks, niceMax) {
  const plotH = CH_H - pad.t - pad.b;
  const yOf = (v) => pad.t + (1 - v / niceMax) * plotH;
  const spans = ticks
    .map((t) => `<span class="cy-ylabel" style="top:${yOf(t).toFixed(1)}px">${fmt(t)}</span>`)
    .join('');
  const wPct = (pad.l / CH_W) * 100;
  return `<div class="cy-yaxis" style="width:${wPct.toFixed(3)}%">${spans}</div>`;
}

// HTML overlay: X-axis dates along the bottom (thinned to ~8 labels).
function chartXLabels(pad, days, centers) {
  const n = days.length;
  const step = Math.max(1, Math.ceil(n / 8));
  const spans = days
    .map((day, i) => {
      if (!(i % step === 0 || i === n - 1)) return '';
      const leftPct = (centers[i] / CH_W) * 100;
      const tx = i === 0 ? '0' : i === n - 1 ? '-100%' : '-50%';
      return `<span class="cy-xlabel" style="left:${leftPct.toFixed(3)}%;transform:translateX(${tx})">${esc(
        day.slice(5)
      )}</span>`;
    })
    .join('');
  return `<div class="cy-xaxis">${spans}</div>`;
}

function renderDaily(daily) {
  const host = $('#daily-chart');
  host.innerHTML = '';
  if (!daily || !daily.length) {
    host.append(el('div', 'empty', 'No visits in this period yet.'));
    return;
  }
  const inner = el('div', 'chart-inner');
  host.appendChild(inner);
  if (dailyMode === 'line') renderDailyLine(inner, daily);
  else renderDailyBars(inner, daily);
}

function renderDailyBars(inner, daily) {
  const pad = CH_PAD;
  const n = daily.length;
  const maxV = Math.max(1, ...daily.map((d) => d.pageViews));
  const { niceMax, ticks } = niceScale(maxV);
  const innerW = CH_W - pad.l - pad.r;
  const plotH = CH_H - pad.t - pad.b;
  const slot = innerW / n;
  const bw = Math.min(36, slot * 0.62);
  const baseY = CH_H - pad.b;
  const hOf = (v) => (v / niceMax) * plotH;

  const centers = [];
  const cols = [];
  const bars = daily
    .map((d, i) => {
      const cx = pad.l + slot * i + slot / 2;
      centers.push(cx);
      const x = (cx - bw / 2).toFixed(1);
      const pvH = hOf(d.pageViews);
      const uH = hOf(d.visitors);
      const w = bw.toFixed(1);
      const rx = Math.min(4, bw / 3).toFixed(1);
      cols.push({
        lo: ((pad.l + slot * i) / CH_W) * 100,
        hi: ((pad.l + slot * (i + 1)) / CH_W) * 100,
        c: (cx / CH_W) * 100,
        day: d.day,
        pv: d.pageViews,
        uq: d.visitors,
        pvTop: baseY - pvH,
        uqTop: baseY - uH,
      });
      // teal column (visits), then dark base (unique visitors) over the bottom
      return (
        (d.pageViews > 0
          ? `<rect x="${x}" y="${(baseY - pvH).toFixed(1)}" width="${w}" height="${pvH.toFixed(
              1
            )}" rx="${rx}" fill="#0fb5ad" />`
          : '') +
        (d.visitors > 0
          ? `<rect x="${x}" y="${(baseY - uH).toFixed(1)}" width="${w}" height="${uH.toFixed(
              1
            )}" rx="${rx}" fill="#0f2330" />`
          : '')
      );
    })
    .join('');

  const grid = ticks
    .map((t) => {
      const yy = (pad.t + (1 - t / niceMax) * plotH).toFixed(1);
      return `<line x1="${pad.l}" y1="${yy}" x2="${CH_W - pad.r}" y2="${yy}" stroke="#eef2f6" />`;
    })
    .join('');

  inner.innerHTML =
    `<svg viewBox="0 0 ${CH_W} ${CH_H}" preserveAspectRatio="none" role="img" aria-label="Daily visits bar chart">${grid}${bars}</svg>` +
    chartYLabels(pad, ticks, niceMax) +
    chartXLabels(pad, daily.map((d) => d.day), centers);

  attachDailyTip(inner, cols, { mode: 'bar', pad });
}

function renderDailyLine(inner, daily) {
  const pad = CH_PAD;
  const n = daily.length;
  const maxV = Math.max(1, ...daily.map((d) => Math.max(d.pageViews, d.visitors)));
  const { niceMax, ticks } = niceScale(maxV);
  const innerW = CH_W - pad.l - pad.r;
  const plotH = CH_H - pad.t - pad.b;
  const xOf = (i) => pad.l + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const yOf = (v) => pad.t + (1 - v / niceMax) * plotH;
  const linePath = (key) =>
    daily.map((d, i) => `${i ? 'L' : 'M'}${xOf(i).toFixed(1)},${yOf(d[key]).toFixed(1)}`).join(' ');
  const area = `${linePath('pageViews')} L${xOf(n - 1).toFixed(1)},${yOf(0).toFixed(1)} L${xOf(0).toFixed(
    1
  )},${yOf(0).toFixed(1)} Z`;

  const grid = ticks
    .map((t) => {
      const yy = yOf(t).toFixed(1);
      return `<line x1="${pad.l}" y1="${yy}" x2="${CH_W - pad.r}" y2="${yy}" stroke="#eef2f6" />`;
    })
    .join('');

  const centers = daily.map((d, i) => xOf(i));
  const cols = daily.map((d, i) => ({
    lo: ((i === 0 ? pad.l : (xOf(i - 1) + xOf(i)) / 2) / CH_W) * 100,
    hi: ((i === n - 1 ? CH_W - pad.r : (xOf(i) + xOf(i + 1)) / 2) / CH_W) * 100,
    c: (xOf(i) / CH_W) * 100,
    day: d.day,
    pv: d.pageViews,
    uq: d.visitors,
    pvTop: yOf(d.pageViews),
    uqTop: yOf(d.visitors),
  }));

  inner.innerHTML =
    `<svg viewBox="0 0 ${CH_W} ${CH_H}" preserveAspectRatio="none" role="img" aria-label="Daily visits line chart">` +
    grid +
    `<path d="${area}" fill="rgba(15,181,173,0.12)" stroke="none" />` +
    `<path d="${linePath('pageViews')}" fill="none" stroke="#0fb5ad" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke" />` +
    `<path d="${linePath('visitors')}" fill="none" stroke="#0f2330" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke" />` +
    `</svg>` +
    chartYLabels(pad, ticks, niceMax) +
    chartXLabels(pad, daily.map((d) => d.day), centers);

  attachDailyTip(inner, cols, { mode: 'line', pad });
}

// Shared hover interaction: a floating tooltip with exact Visits/Unique counts,
// plus a highlight band (bars) or guide line + dots (line), driven by one
// mousemove listener that maps the pointer's x to the nearest day column.
function attachDailyTip(inner, cols, opts) {
  const pad = opts.pad;
  const tip = el('div', 'chart-tip');
  tip.hidden = true;
  const band = el('div', opts.mode === 'bar' ? 'chart-band' : 'chart-guide');
  band.hidden = true;
  inner.appendChild(band);
  let dotV, dotU;
  if (opts.mode === 'line') {
    dotV = el('div', 'chart-dot');
    dotU = el('div', 'chart-dot');
    dotV.style.background = '#0fb5ad';
    dotU.style.background = '#0f2330';
    dotV.hidden = dotU.hidden = true;
    inner.appendChild(dotV);
    inner.appendChild(dotU);
  }
  inner.appendChild(tip);

  const bandTop = pad.t;
  const bandH = CH_H - pad.t - pad.b;

  function hide() {
    tip.hidden = true;
    band.hidden = true;
    if (dotV) dotV.hidden = dotU.hidden = true;
  }

  function show(i) {
    const c = cols[i];
    const rect = inner.getBoundingClientRect();
    tip.innerHTML =
      `<div class="tt-day">${esc(c.day)}</div>` +
      `<div class="tt-row"><span class="tt-dot" style="background:#0fb5ad"></span>Visits<strong>${fmt(c.pv)}</strong></div>` +
      `<div class="tt-row"><span class="tt-dot" style="background:#0f2330"></span>Unique<strong>${fmt(c.uq)}</strong></div>`;
    tip.hidden = false;

    // Highlight
    band.hidden = false;
    band.style.top = bandTop + 'px';
    band.style.height = bandH + 'px';
    if (opts.mode === 'bar') {
      band.style.left = c.lo + '%';
      band.style.width = c.hi - c.lo + '%';
    } else {
      band.style.left = c.c + '%';
      dotV.hidden = dotU.hidden = false;
      dotV.style.left = dotU.style.left = c.c + '%';
      dotV.style.top = c.pvTop + 'px';
      dotU.style.top = c.uqTop + 'px';
    }

    // Position tooltip: centred over the column, above the taller bar/point,
    // flipped below and clamped horizontally so it stays inside the chart.
    const cxPx = (c.c / 100) * rect.width;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let left = cxPx - tw / 2;
    left = Math.max(2, Math.min(rect.width - tw - 2, left));
    let top = Math.min(c.pvTop, c.uqTop) - th - 10;
    if (top < 2) top = Math.min(c.pvTop, c.uqTop) + 12;
    top = Math.max(2, Math.min(rect.height - th - 2, top));
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  inner.addEventListener('mousemove', (e) => {
    const rect = inner.getBoundingClientRect();
    if (!rect.width) return;
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    let idx = -1;
    for (let i = 0; i < cols.length; i++) {
      if (xPct >= cols[i].lo && xPct <= cols[i].hi) {
        idx = i;
        break;
      }
    }
    if (idx === -1) idx = xPct < cols[0].lo ? 0 : cols.length - 1; // snap to nearest end
    show(idx);
  });
  inner.addEventListener('mouseleave', hide);
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

/* ============================================================
   Drill-down modals: click a tile to see the full detail.
   ============================================================ */

// Equirectangular (plate carrée) world map: lon/lat map linearly to x/y, so
// dots placed by the same formula line up exactly. Admin-only page, so an
// external base image is fine; if it fails to load we fall back to a plain
// ocean background + graticule and still plot the dots.
const WORLD_MAP_SRC = 'https://upload.wikimedia.org/wikipedia/commons/8/83/Equirectangular_projection_SW.jpg';

// Approximate country centroids [lat, lon] for the country-level fallback dots
// (used until precise city-level data accumulates). Not exhaustive — countries
// without an entry simply aren't dotted (they still appear in the table).
const CENTROIDS = {
  TZ: [-6.4, 34.9], KE: [0.2, 37.9], UG: [1.4, 32.3], RW: [-1.9, 29.9], BI: [-3.4, 29.9],
  ZA: [-30.6, 22.9], ET: [9.1, 40.5], NG: [9.1, 8.7], GH: [7.9, -1.0], EG: [26.8, 30.8],
  MA: [31.8, -7.1], ZM: [-13.1, 27.8], MZ: [-18.7, 35.5], ZW: [-19.0, 29.2], MW: [-13.3, 34.3],
  GB: [54.0, -2.0], IE: [53.4, -8.2], FR: [46.2, 2.2], DE: [51.2, 10.4], IT: [41.9, 12.6],
  ES: [40.5, -3.7], PT: [39.4, -8.2], NL: [52.1, 5.3], BE: [50.5, 4.5], CH: [46.8, 8.2],
  AT: [47.5, 14.6], SE: [60.1, 18.6], NO: [60.5, 8.5], DK: [56.3, 9.5], FI: [61.9, 25.7],
  PL: [51.9, 19.1], CZ: [49.8, 15.5], GR: [39.1, 21.8], RO: [45.9, 24.9], HU: [47.2, 19.5],
  RU: [61.5, 105.3], UA: [48.4, 31.2], TR: [39.0, 35.2], IL: [31.0, 34.9],
  AE: [23.4, 53.8], SA: [23.9, 45.1], QA: [25.3, 51.2], IN: [22.4, 78.9], PK: [30.4, 69.3],
  CN: [35.9, 104.2], JP: [36.2, 138.3], KR: [35.9, 127.8], TH: [15.9, 100.9], SG: [1.35, 103.8],
  MY: [4.2, 101.9], ID: [-2.5, 118.0], PH: [12.9, 121.8], VN: [14.1, 108.3],
  US: [39.8, -98.6], CA: [56.1, -106.3], MX: [23.6, -102.5], BR: [-14.2, -51.9], AR: [-38.4, -63.6],
  CL: [-35.7, -71.5], CO: [4.6, -74.3], PE: [-9.2, -75.0], AU: [-25.3, 133.8], NZ: [-40.9, 174.9],
};

function ensureModal() {
  let ov = document.getElementById('drill-modal');
  if (ov) return ov;
  ov = el('div', 'modal-overlay');
  ov.id = 'drill-modal';
  ov.hidden = true;
  ov.innerHTML =
    '<div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="drill-title">' +
    '<div class="modal-head"><h3 class="modal-title" id="drill-title"></h3>' +
    '<button class="modal-close" type="button" aria-label="Close">✕</button></div>' +
    '<div class="modal-body"></div></div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', (e) => {
    if (e.target === ov || e.target.closest('.modal-close')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
  return ov;
}
function openModal(title, node) {
  const ov = ensureModal();
  ov.querySelector('.modal-title').textContent = title;
  const body = ov.querySelector('.modal-body');
  body.innerHTML = '';
  body.appendChild(node);
  ov.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  const ov = document.getElementById('drill-modal');
  if (ov) ov.hidden = true;
  document.body.style.overflow = '';
}

function buildMapPoints(d) {
  const pts = [];
  const seen = new Set();
  (d.locations || []).forEach((l) => {
    if (l.lat == null || l.lon == null) return;
    if (l.country) seen.add(l.country);
    const label = [l.city, l.region, countryLabel(l.country)].filter(Boolean).join(', ') || 'Unknown';
    pts.push({ lat: l.lat, lon: l.lon, count: l.count, label, kind: 'city' });
  });
  (d.countries || []).forEach((c) => {
    if (seen.has(c.key)) return; // finer city dots already cover this country
    const cc = CENTROIDS[c.key];
    if (!cc) return;
    pts.push({ lat: cc[0], lon: cc[1], count: c.count, label: countryLabel(c.key), kind: 'country' });
  });
  return pts;
}

function worldMap(d) {
  const wrap = el('div', 'worldmap');
  const img = new Image();
  img.className = 'worldmap-img';
  img.alt = '';
  img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => wrap.classList.add('worldmap-noimg'));
  img.src = WORLD_MAP_SRC;
  wrap.appendChild(img);

  const layer = el('div', 'worldmap-dots');
  wrap.appendChild(layer);

  const pts = buildMapPoints(d);
  const max = Math.max(1, ...pts.map((p) => p.count));
  pts.forEach((p) => {
    const size = 8 + Math.sqrt(p.count / max) * 22;
    const dot = el('div', 'worldmap-dot' + (p.kind === 'city' ? ' is-city' : ''));
    dot.style.left = ((p.lon + 180) / 360) * 100 + '%';
    dot.style.top = ((90 - p.lat) / 180) * 100 + '%';
    dot.style.width = dot.style.height = size.toFixed(1) + 'px';
    dot.title = `${p.label} — ${fmt(p.count)} visitor${p.count === 1 ? '' : 's'}`;
    layer.appendChild(dot);
  });
  if (!pts.length) wrap.appendChild(el('div', 'worldmap-empty', 'No location data in this period yet.'));
  return wrap;
}

function locationView(d) {
  const wrap = el('div', 'drill');
  wrap.appendChild(worldMap(d));
  wrap.appendChild(
    el(
      'div',
      'map-legend',
      '<span><i class="mdot city"></i>City (precise)</span><span><i class="mdot country"></i>Country (approx.)</span>'
    )
  );
  const locs = d.locations || [];
  if (locs.length) {
    const rows = locs
      .map(
        (l) =>
          `<tr><td>${esc([l.city, l.region].filter(Boolean).join(', ') || '—')}</td>` +
          `<td>${flagEmoji(l.country)} ${esc(countryLabel(l.country))}</td><td>${fmt(l.count)}</td></tr>`
      )
      .join('');
    wrap.appendChild(
      el(
        'div',
        'table-wrap',
        `<table><thead><tr><th>City / Region</th><th>Country</th><th>Visitors</th></tr></thead><tbody>${rows}</tbody></table>`
      )
    );
  } else {
    wrap.appendChild(
      el('p', 'card-sub', 'City-level detail appears here as new visits are recorded. Showing country totals for now.')
    );
    const rows = (d.countries || [])
      .map((c) => `<tr><td>${flagEmoji(c.key)} ${esc(countryLabel(c.key))}</td><td>${fmt(c.count)}</td></tr>`)
      .join('');
    wrap.appendChild(
      el('div', 'table-wrap', `<table><thead><tr><th>Country</th><th>Visitors</th></tr></thead><tbody>${rows}</tbody></table>`)
    );
  }
  return wrap;
}

function deviceView(d) {
  const wrap = el('div', 'drill');
  const dd = d.deviceDetails || [];
  if (dd.length) {
    const rows = dd
      .map(
        (x) =>
          `<tr><td>${esc(x.model)}</td><td>${esc(x.os)}</td><td>${esc(x.browser)}</td>` +
          `<td>${esc(x.resolution)}</td><td>${fmt(x.count)}</td></tr>`
      )
      .join('');
    wrap.appendChild(
      el(
        'div',
        'table-wrap',
        `<table><thead><tr><th>Device</th><th>OS</th><th>Browser</th><th>Screen</th><th>Sessions</th></tr></thead><tbody>${rows}</tbody></table>`
      )
    );
    wrap.appendChild(
      el(
        'p',
        'card-sub',
        'Apple hides the exact model, so iPhone/iPad are a best guess from screen size (labelled “likely”). Android models are exact. Screen is in CSS pixels × pixel-ratio.'
      )
    );
  } else {
    wrap.appendChild(el('p', 'card-sub', 'Detailed device data appears here as new visits are recorded.'));
  }
  return wrap;
}

function listView(items, labelHtml, header) {
  const rows = (items || []).map((r) => `<tr><td>${labelHtml(r)}</td><td>${fmt(r.count)}</td></tr>`).join('');
  return el(
    'div',
    'table-wrap',
    `<table><thead><tr><th>${esc(header)}</th><th>Visitors</th></tr></thead><tbody>${rows}</tbody></table>`
  );
}

/* ---- Device opt-out (exclude the owner's own phone/laptop) ----
   Same origin as the public site, so the flag set here is read by
   analytics-client.js on the live site. Stored as a durable cookie + a
   localStorage flag; the tracker bails out when it sees either. */
const OPTOUT_KEY = 'fp_no_track';
function isOptedOut() {
  try {
    if (document.cookie.split('; ').some((c) => c === OPTOUT_KEY + '=1')) return true;
    if (window.localStorage && localStorage.getItem(OPTOUT_KEY) === '1') return true;
  } catch {
    /* ignore */
  }
  return false;
}
function setOptOut(on) {
  try {
    if (on) {
      if (window.localStorage) localStorage.setItem(OPTOUT_KEY, '1');
      document.cookie = OPTOUT_KEY + '=1; path=/; max-age=' + 60 * 60 * 24 * 730 + '; SameSite=Lax';
    } else {
      if (window.localStorage) localStorage.removeItem(OPTOUT_KEY);
      document.cookie = OPTOUT_KEY + '=; path=/; max-age=0; SameSite=Lax';
    }
  } catch {
    /* ignore */
  }
}
function reflectOptOut() {
  const btn = $('#optout-toggle');
  if (!btn) return;
  const on = isOptedOut();
  btn.setAttribute('aria-checked', on ? 'true' : 'false');
  btn.classList.toggle('on', on);
  const bar = btn.closest('.optout-bar');
  if (bar) bar.classList.toggle('on', on);
  const state = $('#optout-state');
  if (state)
    state.textContent = on
      ? 'This device is excluded — its visits are no longer counted.'
      : 'Visits from this phone/laptop are being counted.';
}

function openDrill(kind) {
  const d = lastData;
  if (!d) return;
  if (kind === 'locations') openModal('Locations', locationView(d));
  else if (kind === 'devices') openModal('Devices', deviceView(d));
  else if (kind === 'browsers') openModal('Browsers', listView(d.browsers, (r) => esc(cap(r.key)), 'Browser'));
  else if (kind === 'screens') openModal('Screen sizes', listView(d.screens, (r) => esc(screenLabel(r.key)), 'Screen size'));
  else if (kind === 'toppages') openModal('Top pages', listView(d.topPages, (r) => esc(r.title), 'Page'));
}

// Initialised lazily by the admin shell the first time the Analytics tab is
// opened, so no analytics request fires while the operator is in Class Admin.
let analyticsStarted = false;
export function initAnalytics() {
  if (analyticsStarted) return;
  analyticsStarted = true;

  // Delegated: any tile marked data-drill opens its detailed modal.
  const panel = document.getElementById('tab-analytics') || document;
  panel.addEventListener('click', (e) => {
    const card = e.target.closest('.card[data-drill]');
    if (card) openDrill(card.getAttribute('data-drill'));
  });
  panel.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.card[data-drill]');
    if (card) {
      e.preventDefault();
      openDrill(card.getAttribute('data-drill'));
    }
  });

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

  const optBtn = $('#optout-toggle');
  if (optBtn) {
    reflectOptOut();
    optBtn.addEventListener('click', () => {
      setOptOut(!isOptedOut());
      reflectOptOut();
    });
  }

  load('30d');
}
