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

let currentRange = '30d';

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
  renderSummary(d.summary);
  renderDaily(d.daily);
  renderInterest(d.pageInterest);
  renderBars('#time-bars', d.timeByPage.map((r) => ({ label: r.title, value: r.seconds })), fmtTime);
  renderBars('#countries-bars', d.countries.map((r) => ({ label: countryLabel(r.key), value: r.count })));
  renderBars('#devices-bars', d.devices.map((r) => ({ label: cap(r.key), value: r.count })));
  renderBars('#browsers-bars', d.browsers.map((r) => ({ label: cap(r.key), value: r.count })));
  renderBars('#screens-bars', d.screens.map((r) => ({ label: screenLabel(r.key), value: r.count })));
  renderBars('#toppages-bars', d.topPages.map((r) => ({ label: r.title, value: r.count })));
  renderBars('#sources-bars', d.sources.map((r) => ({ label: cap(r.key), value: r.count })));
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

function renderSummary(s) {
  const wrap = $('#summary-cards');
  wrap.innerHTML = '';
  const cards = [
    { label: 'Visitors', value: fmt(s.visitors) },
    { label: 'Page views', value: fmt(s.pageViews) },
    { label: 'Top country', value: countryLabel(s.topCountry) },
  ];
  cards.forEach((c) => {
    const n = el('div', 'metric');
    n.append(el('div', 'label', esc(c.label)), el('div', 'value', esc(c.value)));
    wrap.append(n);
  });
  // Devices card with chips
  const dev = el('div', 'metric');
  dev.append(el('div', 'label', 'Devices'));
  const top = (s.devices && s.devices[0]) || { key: '—', count: 0 };
  dev.append(el('div', 'value', esc(cap(top.key))));
  const chips = el('div', 'chips');
  (s.devices || []).forEach((x) => chips.append(el('span', 'chip', `${esc(cap(x.key))} ${fmt(x.count)}`)));
  dev.append(chips);
  wrap.append(dev);
}

function renderDaily(daily) {
  const host = $('#daily-chart');
  host.innerHTML = '';
  if (!daily || !daily.length) {
    host.append(el('div', 'empty', 'No visits in this period yet.'));
    return;
  }
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

  const gridY = [0, 0.5, 1].map((t) => {
    const yy = pad.t + t * (H - pad.t - pad.b);
    const val = Math.round(maxV * (1 - t));
    return `<line x1="${pad.l}" y1="${yy}" x2="${W - pad.r}" y2="${yy}" stroke="#eef2f6" />
            <text x="4" y="${yy + 4}" font-size="11" fill="#9aa7b2">${val}</text>`;
  }).join('');

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
    <path d="${line('visitors')}" fill="none" stroke="#6c7bf7" stroke-width="2.5" stroke-linejoin="round" stroke-dasharray="0" />
    ${labels}
  </svg>`;
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

// Range tabs
$('#ranges').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-range]');
  if (!btn) return;
  document.querySelectorAll('#ranges button').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  load(btn.dataset.range);
});

load('30d');
