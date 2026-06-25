/* ============================================================
   Fit Pit — inline WYSIWYG editor (admin only)
   ------------------------------------------------------------
   Loaded as a lazy Vite chunk ONLY when the public page is opened from the
   admin's "Website Content" tab (?edit=1 + an unlocked admin PIN in this
   browser session). Public visitors never download this file.

   It turns every element the page marks with `data-edit` (text) or
   `data-edit-img` (images) into an editable surface, on top of the REAL site
   so the owner edits exactly what visitors see. Saving writes the override set
   to /api/content (text) and uploads replaced photos via /api/upload — both
   PIN-gated server-side. Toggling edit mode is purely client-side, so loading
   this with no PIN persists nothing.

   Model: index.html holds the hardcoded DEFAULTS. We snapshot those, then save
   only the keys whose value differs from the default — so "reset to default" is
   simply editing a value back to its original (the key drops out of the store).
   ============================================================ */

const pin = () => { try { return sessionStorage.getItem('fp_admin_pin') || ''; } catch { return ''; } };
const framed = window.parent && window.parent !== window;

let dirty = false;
let toolbar, statusEl, saveBtn, statusTimer;

// Read an element's text as plain text: text nodes verbatim, <br> → newline,
// nested inline tags (e.g. <strong>) flattened, decorative <svg> icons skipped.
// Works on display:none elements (modals) — unlike innerText.
function readText(el) {
  let out = '';
  el.childNodes.forEach((n) => {
    if (n.nodeType === 3) out += n.nodeValue;
    else if (n.nodeName === 'BR') out += '\n';
    else if (n.nodeName && n.nodeName.toUpperCase() === 'SVG') { /* skip icon */ }
    else if (n.nodeType === 1) out += readText(n);
  });
  return out;
}

// Write plain text back, turning newlines into <br> (mirrors readText). Never
// assigns innerHTML, so stored values can't inject markup.
function writeText(el, value) {
  const s = String(value == null ? '' : value);
  el.textContent = '';
  s.split('\n').forEach((line, i) => {
    if (i) el.appendChild(document.createElement('br'));
    el.appendChild(document.createTextNode(line));
  });
}

function curImg(el) { return el.getAttribute('src') || ''; }

function markChanged(el) {
  const def = el.dataset.editDefault || '';
  const cur = el.hasAttribute('data-edit-img') ? curImg(el) : readText(el);
  el.classList.toggle('fp-edit-changed', cur !== def);
}

export function initEdit() {
  const texts = Array.from(document.querySelectorAll('[data-edit]'));
  const imgs = Array.from(document.querySelectorAll('[data-edit-img]'));

  // 1. Snapshot hardcoded defaults FIRST (main.js does not apply overrides in
  //    edit mode, so the DOM still shows the originals at this point).
  texts.forEach((el) => { if (el.dataset.editDefault == null) el.dataset.editDefault = readText(el); });
  imgs.forEach((el) => { if (el.dataset.editDefault == null) el.dataset.editDefault = curImg(el); });

  injectStyles();
  document.documentElement.classList.add('fp-editing');
  buildToolbar();

  // 2. Pull the saved overrides and apply them so the editor shows the live
  //    state (what visitors currently see).
  fetch('/api/content', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d) return;
      const t = d.text || {};
      const im = d.images || {};
      texts.forEach((el) => {
        const k = el.getAttribute('data-edit');
        if (Object.prototype.hasOwnProperty.call(t, k)) { writeText(el, t[k]); markChanged(el); }
      });
      imgs.forEach((el) => {
        const k = el.getAttribute('data-edit-img');
        if (im[k]) { el.removeAttribute('srcset'); el.src = im[k]; markChanged(el); }
      });
    })
    .catch(() => {});

  // 3. Make text editable (plaintext-only keeps the site's markup intact).
  texts.forEach((el) => {
    el.setAttribute('contenteditable', 'plaintext-only');
    if (el.contentEditable !== 'plaintext-only') {
      el.setAttribute('contenteditable', 'true');
      el.addEventListener('paste', (e) => {
        e.preventDefault();
        const txt = (e.clipboardData || window.clipboardData).getData('text');
        document.execCommand('insertText', false, txt);
      });
    }
    el.setAttribute('spellcheck', 'false');
    // Single-line fields (everything but <p>) can't grow into two lines.
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && el.tagName !== 'P') { e.preventDefault(); el.blur(); }
    });
    el.addEventListener('input', () => { markChanged(el); setDirty(true); });
  });
  imgs.forEach((el) => { el.title = 'Click to replace this photo'; });

  // 4. Intercept clicks on editable elements: stop link/button actions so the
  //    owner can edit labels; open the file picker for images.
  document.addEventListener('click', onClick, true);

  // 5. Allow the parent admin tab to drive Save/Discard, and tell it our state.
  window.addEventListener('message', onMsg);
  postParent('ready');
  status('Click any text to edit it, or a photo to replace it.', 6000);
}

function onClick(e) {
  const img = e.target.closest('[data-edit-img]');
  if (img) { e.preventDefault(); e.stopPropagation(); openPicker(img); return; }
  const txt = e.target.closest('[data-edit]');
  if (txt && e.target.closest('a, button')) {
    // Editing a label that lives inside a link/button — block its navigation
    // or modal-open handler so the click just places the caret.
    e.preventDefault();
    e.stopPropagation();
  }
}

function onMsg(e) {
  if (e.origin !== location.origin) return;
  const d = e.data;
  if (!d || d.type !== 'fp-edit') return;
  if (d.kind === 'save') save();
  else if (d.kind === 'discard') discard();
}

function postParent(kind, extra) {
  if (!framed) return;
  try { window.parent.postMessage(Object.assign({ type: 'fp-edit', kind }, extra || {}), location.origin); } catch { /* ignore */ }
}

/* ---- image replace ---- */

function openPicker(imgEl) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/webp';
  input.addEventListener('change', () => { if (input.files && input.files[0]) uploadImage(imgEl, input.files[0]); });
  input.click();
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

async function uploadImage(imgEl, file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { status('Use a JPG, PNG or WebP image.'); return; }
  if (file.size > 6_000_000) { status('Image must be under 6MB.'); return; }
  status('Uploading photo…', 0);
  try {
    const data = await fileToDataURL(file);
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-pin': pin() },
      body: JSON.stringify({ contentType: file.type, data, folder: 'site-images' }),
    });
    const d = await res.json().catch(() => null);
    if (res.ok && d && d.url) {
      imgEl.removeAttribute('srcset');
      imgEl.src = d.url;
      markChanged(imgEl);
      setDirty(true);
      status('Photo updated — press Save to publish.', 5000);
    } else {
      status((d && d.message) || 'Upload failed. Try again.');
    }
  } catch {
    status('Upload failed — network error.');
  }
}

/* ---- save / discard ---- */

function collect() {
  const text = {};
  const images = {};
  document.querySelectorAll('[data-edit]').forEach((el) => {
    const cur = readText(el);
    if (cur !== (el.dataset.editDefault || '')) text[el.getAttribute('data-edit')] = cur;
  });
  document.querySelectorAll('[data-edit-img]').forEach((el) => {
    const cur = curImg(el);
    if (cur !== (el.dataset.editDefault || '')) images[el.getAttribute('data-edit-img')] = cur;
  });
  return { text, images };
}

async function save() {
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
  status('Saving…', 0);
  try {
    const res = await fetch('/api/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-pin': pin() },
      body: JSON.stringify(collect()),
    });
    if (res.ok) {
      dirty = false;
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saved'; }
      status('Saved ✓ — your changes are live.', 5000);
      postParent('saved');
    } else {
      const d = await res.json().catch(() => null);
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save changes'; }
      status((d && d.message) || (res.status === 401 ? 'Wrong PIN — re-open from the admin.' : 'Save failed.'));
      postParent('error');
    }
  } catch {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save changes'; }
    status('Save failed — network error.');
    postParent('error');
  }
}

function discard() {
  if (!dirty || window.confirm('Discard all unsaved changes?')) location.reload();
}

/* ---- toolbar / status ---- */

function setDirty(v) {
  dirty = v;
  if (saveBtn) { saveBtn.disabled = !v; saveBtn.textContent = v ? 'Save changes' : 'Saved'; }
  if (v) postParent('dirty');
}

function status(msg, ms = 3500) {
  if (!statusEl) return;
  clearTimeout(statusTimer);
  statusEl.textContent = msg || '';
  statusEl.hidden = !msg;
  if (msg && ms) statusTimer = setTimeout(() => { statusEl.hidden = true; }, ms);
}

function buildToolbar() {
  toolbar = document.createElement('div');
  toolbar.className = 'fp-edit-bar';
  toolbar.setAttribute('data-fp-edit-ui', '');
  toolbar.innerHTML =
    '<span class="fp-edit-title">Editing website</span>' +
    '<button type="button" class="fp-edit-link" data-modal="daily-pass-modal">Daily&nbsp;Pass pop-up</button>' +
    '<button type="button" class="fp-edit-link" data-modal="clinic-modal">Clinic pop-up</button>' +
    '<span class="fp-edit-status" hidden></span>' +
    '<span class="fp-edit-spacer"></span>' +
    '<button type="button" class="fp-edit-btn fp-edit-discard">Discard</button>' +
    '<button type="button" class="fp-edit-btn fp-edit-save" disabled>Saved</button>';
  document.body.appendChild(toolbar);
  statusEl = toolbar.querySelector('.fp-edit-status');
  saveBtn = toolbar.querySelector('.fp-edit-save');
  toolbar.querySelector('.fp-edit-discard').addEventListener('click', discard);
  saveBtn.addEventListener('click', save);
  toolbar.querySelectorAll('[data-modal]').forEach((b) =>
    b.addEventListener('click', () => {
      const dlg = document.getElementById(b.dataset.modal);
      if (dlg && dlg.showModal) { try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); } }
    })
  );
}

function injectStyles() {
  const css = `
  html.fp-editing [data-edit]{outline:1px dashed rgba(37,99,235,.45);outline-offset:2px;border-radius:2px;cursor:text;transition:outline-color .12s,background .12s;}
  html.fp-editing [data-edit]:hover{outline-color:#2563eb;background:rgba(37,99,235,.07);}
  html.fp-editing [data-edit]:focus{outline:2px solid #2563eb;background:rgba(37,99,235,.10);}
  html.fp-editing [data-edit-img]{outline:2px dashed rgba(37,99,235,.55);outline-offset:3px;cursor:pointer;}
  html.fp-editing [data-edit-img]:hover{outline-color:#2563eb;filter:brightness(.9);}
  html.fp-editing .fp-edit-changed{outline-color:#f59e0b !important;}
  html.fp-editing .reveal{opacity:1 !important;transform:none !important;}
  html.fp-editing .whatsapp-float{display:none !important;}
  .fp-edit-bar{position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 12px;background:#0f172a;color:#fff;border-radius:12px;box-shadow:0 10px 34px rgba(0,0,0,.4);font-family:Inter,system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.2;}
  .fp-edit-bar *{box-sizing:border-box;}
  .fp-edit-title{font-weight:700;letter-spacing:.01em;}
  .fp-edit-title::before{content:"✏️";margin-right:6px;}
  .fp-edit-spacer{flex:1 1 auto;}
  .fp-edit-status{opacity:.9;font-size:13px;}
  .fp-edit-link{background:rgba(255,255,255,.12);color:#fff;border:0;border-radius:8px;padding:7px 10px;cursor:pointer;font:inherit;}
  .fp-edit-link:hover{background:rgba(255,255,255,.22);}
  .fp-edit-btn{border:0;border-radius:8px;padding:8px 16px;cursor:pointer;font:inherit;font-weight:700;}
  .fp-edit-discard{background:rgba(255,255,255,.14);color:#fff;}
  .fp-edit-discard:hover{background:rgba(255,255,255,.24);}
  .fp-edit-save{background:#22c55e;color:#052e1b;}
  .fp-edit-save:not(:disabled):hover{background:#16a34a;}
  .fp-edit-save:disabled{opacity:.5;cursor:default;}
  @media (max-width:640px){.fp-edit-title{flex-basis:100%;}}
  `;
  const style = document.createElement('style');
  style.setAttribute('data-fp-edit-ui', '');
  style.textContent = css;
  document.head.appendChild(style);
}
