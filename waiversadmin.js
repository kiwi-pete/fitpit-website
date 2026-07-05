/* ============================================================
   Fit Pit admin — Day Pass Waivers tab
   ------------------------------------------------------------
   Lists signed day-pass waivers (from /api/submit-daypass-waiver, PIN-gated)
   and shows the full record — including the signature and selfie — in a modal.
   ============================================================ */

let PIN = '';
let loaded = false;

const $ = (id) => document.getElementById(id);

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Only trust data: image URLs for <img src> (values come from the DB).
const safeImg = (v) => (typeof v === 'string' && v.startsWith('data:image/') ? v : '');

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return esc(iso);
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  if (isNaN(d)) return esc(s);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function api(query) {
  const res = await fetch(`/api/submit-daypass-waiver${query}`, {
    headers: { 'x-admin-pin': PIN },
    cache: 'no-store',
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function setStatus(msg, kind = 'info') {
  const el = $('dpw-status');
  if (!el) return;
  if (!msg) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = msg;
  el.className = `status ${kind}`;
}

function renderRows(waivers) {
  const tbody = $('dpw-table').querySelector('tbody');
  const empty = $('dpw-empty');
  tbody.innerHTML = '';
  if (!waivers.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  for (const w of waivers) {
    const emergency = [w.emergency_contact_name, w.emergency_contact_number]
      .filter(Boolean).join(' · ') || '—';
    const tr = document.createElement('tr');
    tr.className = 'dpw-row';
    tr.dataset.id = w.id;
    tr.innerHTML = `
      <td>${esc(fmtDateTime(w.signed_at))}</td>
      <td>${esc(w.full_name || '—')}</td>
      <td>${esc(w.contact_number || '—')}</td>
      <td>${esc(emergency)}</td>
      <td>${esc(fmtDate(w.visit_date))}</td>
      <td><button type="button" class="ca-btn ca-btn-sm dpw-view">View</button></td>`;
    tbody.appendChild(tr);
  }
}

async function loadList() {
  setStatus('Loading…');
  try {
    const { waivers } = await api('');
    renderRows(waivers || []);
    setStatus('');
  } catch (err) {
    setStatus(`Could not load waivers: ${err.message}`, 'error');
  }
}

function closeModal() {
  const m = $('dpw-modal');
  if (m) m.hidden = true;
  $('dpw-modal-body').innerHTML = '';
}

async function openDetail(id) {
  const modal = $('dpw-modal');
  const bodyEl = $('dpw-modal-body');
  modal.hidden = false;
  bodyEl.innerHTML = '<p class="dpw-loading">Loading…</p>';
  try {
    const { waiver: w } = await api(`?id=${encodeURIComponent(id)}`);
    $('dpw-modal-title').textContent = w.full_name || 'Day Pass Waiver';
    const sig = w.signature_type === 'draw' ? safeImg(w.signature_data) : '';
    const selfie = safeImg(w.selfie_data);
    const rows = [
      ['Signed', fmtDateTime(w.signed_at)],
      ['Full name', w.full_name],
      ['Contact number', w.contact_number],
      ['Emergency contact', [w.emergency_contact_name, w.emergency_contact_number].filter(Boolean).join(' · ') || '—'],
      ['Email', w.email || '—'],
      ['Intended visit date', fmtDate(w.visit_date)],
      ['Health declaration accepted', w.health_declaration ? 'Yes' : 'No'],
      ['Waiver & rules agreed', w.consent ? 'Yes' : 'No'],
      ['Waiver version', w.waiver_version || '—'],
    ];
    bodyEl.innerHTML = `
      <div class="dpw-detail">
        <div class="dpw-media">
          <div class="dpw-media-box">
            <span class="dpw-media-label">Photo</span>
            ${selfie ? `<img src="${selfie}" alt="Visitor selfie" />` : '<p class="dpw-none">No photo</p>'}
          </div>
          <div class="dpw-media-box">
            <span class="dpw-media-label">Signature</span>
            ${
              w.signature_type === 'draw'
                ? (sig ? `<img class="dpw-sig" src="${sig}" alt="Signature" />` : '<p class="dpw-none">No signature</p>')
                : `<p class="dpw-typed">${esc(w.signature_data)}</p><span class="dpw-typed-note">(typed)</span>`
            }
          </div>
        </div>
        <dl class="dpw-fields">
          ${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}
        </dl>
      </div>`;
  } catch (err) {
    bodyEl.innerHTML = `<p class="status error">Could not load waiver: ${esc(err.message)}</p>`;
  }
}

export function initWaivers({ pin }) {
  PIN = pin || '';
  if (!loaded) {
    loaded = true;
    $('dpw-refresh')?.addEventListener('click', loadList);
    $('dpw-table').querySelector('tbody').addEventListener('click', (e) => {
      const row = e.target.closest('.dpw-row');
      if (row) openDetail(row.dataset.id);
    });
    $('dpw-modal-close')?.addEventListener('click', closeModal);
    $('dpw-modal')?.addEventListener('click', (e) => {
      if (e.target === $('dpw-modal')) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('dpw-modal').hidden) closeModal();
    });
  }
  loadList();
}
