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
