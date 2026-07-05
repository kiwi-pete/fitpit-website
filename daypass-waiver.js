/* ============================================================
   Fit Pit — Day Pass Waiver page logic
   ------------------------------------------------------------
   Standalone page (not part of the main site bundle). Handles the
   draw/type signature pad, the selfie capture, client-side validation,
   and submission to /api/submit-daypass-waiver.
   ============================================================ */

// ---------- Signature pad (draw with finger or mouse) ----------
function initSignaturePad(canvasEl) {
  const ctx = canvasEl.getContext('2d');
  let hasInk = false;      // true once any visible mark exists (a tap dot counts)
  let isDrawing = false;

  const applyStroke = () => {
    ctx.strokeStyle =
      getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || '#8B7BF7';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  const resize = () => {
    const rect = canvasEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return; // hidden panel — retry later
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvasEl.width === w && canvasEl.height === h) {
      applyStroke();
      return;
    }
    // Preserve any existing signature across a genuine resize (e.g. rotation)
    // by snapshotting the current bitmap and redrawing it at the new size.
    let snap = null;
    if (hasInk && canvasEl.width > 0 && canvasEl.height > 0) {
      snap = document.createElement('canvas');
      snap.width = canvasEl.width;
      snap.height = canvasEl.height;
      snap.getContext('2d').drawImage(canvasEl, 0, 0);
    }
    canvasEl.width = w;
    canvasEl.height = h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // idempotent — never compounds
    applyStroke();
    if (snap) ctx.drawImage(snap, 0, 0, rect.width, rect.height);
  };

  const pos = (e) => {
    const rect = canvasEl.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: cx - rect.left, y: cy - rect.top };
  };

  const start = (e) => {
    isDrawing = true;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    // Lay down a dot immediately so even a single tap leaves a visible mark AND
    // counts as ink — a "signed" pad is never blank when hasInk is true.
    ctx.lineTo(p.x + 0.1, p.y + 0.1);
    ctx.stroke();
    hasInk = true;
    e.preventDefault();
  };
  const move = (e) => {
    if (!isDrawing) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    hasInk = true;
    e.preventDefault();
  };
  const stop = () => { isDrawing = false; };

  canvasEl.addEventListener('mousedown', start);
  canvasEl.addEventListener('mousemove', move);
  canvasEl.addEventListener('mouseup', stop);
  canvasEl.addEventListener('mouseleave', stop);
  canvasEl.addEventListener('touchstart', start, { passive: false });
  canvasEl.addEventListener('touchmove', move, { passive: false });
  canvasEl.addEventListener('touchend', stop);
  canvasEl.addEventListener('touchcancel', stop);
  window.addEventListener('resize', resize);
  resize();

  return {
    resize,
    clear: () => {
      const rect = canvasEl.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width || canvasEl.width, rect.height || canvasEl.height);
      hasInk = false;
    },
    isBlank: () => !hasInk,
    getDataURL: () => canvasEl.toDataURL('image/png'),
  };
}

// ---------- Elements ----------
const form = document.getElementById('waiver-form');
const canvas = document.getElementById('signature-canvas');
const typedInput = document.getElementById('signature-typed');
const tabDraw = document.getElementById('tab-draw');
const tabType = document.getElementById('tab-type');
const panelDraw = document.getElementById('panel-draw');
const panelType = document.getElementById('panel-type');
const clearBtn = document.getElementById('btn-clear-sig');
const submitBtn = document.getElementById('btn-submit');
const fieldSig = document.getElementById('field-sig');
const signDateEl = document.getElementById('sign-date');

const statusLoading = document.getElementById('status-loading');
const statusSuccess = document.getElementById('status-success');
const statusError = document.getElementById('status-error');
const errorText = document.getElementById('error-text');
const retryBtn = document.getElementById('btn-retry');

const sigPad = initSignaturePad(canvas);
let sigMode = 'draw';

// ---------- Selfie capture ----------
const fieldSelfie = document.getElementById('field-selfie');
const selfieIdle = document.getElementById('selfie-idle');
const selfieLive = document.getElementById('selfie-live');
const selfieResult = document.getElementById('selfie-result');
const selfieVideo = document.getElementById('selfie-video');
const selfieImg = document.getElementById('selfie-img');
const selfieFile = document.getElementById('selfie-file');
const btnTakePhoto = document.getElementById('btn-take-photo');
const btnCapture = document.getElementById('btn-capture');
const btnCancelCamera = document.getElementById('btn-cancel-camera');
const btnRetake = document.getElementById('btn-retake');

let selfieDataUrl = '';
let mediaStream = null;

function showSelfieStage(stage) {
  selfieIdle.hidden = stage !== 'idle';
  selfieLive.hidden = stage !== 'live';
  selfieResult.hidden = stage !== 'result';
}

function stopStream() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
}

// Draw an image/video frame to an offscreen canvas, downscaled + JPEG-compressed.
function downscaleToDataUrl(source, sw, sh) {
  const maxDim = 640; // low-res is fine — just enough to recognise the person
  let w = sw || maxDim;
  let h = sh || maxDim;
  if (Math.max(w, h) > maxDim) {
    const scale = maxDim / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d').drawImage(source, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.6);
}

async function startCamera() {
  fieldSelfie.classList.remove('invalid');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    selfieFile.click(); // no live camera API — use the native camera picker
    return;
  }
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    selfieVideo.srcObject = mediaStream;
    await selfieVideo.play().catch(() => {});
    showSelfieStage('live');
  } catch (err) {
    console.warn('Live camera unavailable, using file capture:', err);
    selfieFile.click();
  }
}

btnTakePhoto.addEventListener('click', startCamera);
btnCancelCamera.addEventListener('click', () => {
  stopStream();
  showSelfieStage(selfieDataUrl ? 'result' : 'idle');
});
btnRetake.addEventListener('click', () => {
  selfieDataUrl = '';
  startCamera();
});
btnCapture.addEventListener('click', () => {
  const vw = selfieVideo.videoWidth || 640;
  const vh = selfieVideo.videoHeight || 480;
  selfieDataUrl = downscaleToDataUrl(selfieVideo, vw, vh);
  selfieImg.src = selfieDataUrl;
  stopStream();
  showSelfieStage('result');
  fieldSelfie.classList.remove('invalid');
});
selfieFile.addEventListener('change', () => {
  const file = selfieFile.files && selfieFile.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    selfieDataUrl = downscaleToDataUrl(img, img.naturalWidth, img.naturalHeight);
    selfieImg.src = selfieDataUrl;
    URL.revokeObjectURL(url);
    showSelfieStage('result');
    fieldSelfie.classList.remove('invalid');
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    fieldSelfie.classList.add('invalid');
  };
  img.src = url;
  selfieFile.value = ''; // allow re-selecting the same file
});

// ---------- Signing date (display + payload) ----------
const now = new Date();
const signingDisplay = now.toLocaleDateString('en-GB', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});
signDateEl.textContent = signingDisplay;

// Prefill "date of visit" with today (local date, not UTC).
const visitDateInput = document.getElementById('visit_date');
const p2 = (n) => String(n).padStart(2, '0');
const todayLocal = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;
if (visitDateInput) visitDateInput.value = todayLocal;

// ---------- Signature tab switching ----------
function selectMode(mode) {
  sigMode = mode;
  const draw = mode === 'draw';
  tabDraw.classList.toggle('active', draw);
  tabType.classList.toggle('active', !draw);
  tabDraw.setAttribute('aria-selected', String(draw));
  tabType.setAttribute('aria-selected', String(!draw));
  panelDraw.classList.toggle('active', draw);
  panelType.classList.toggle('active', !draw);
  fieldSig.classList.remove('invalid');
  if (draw) requestAnimationFrame(() => sigPad.resize());
  else requestAnimationFrame(() => typedInput.focus());
}
tabDraw.addEventListener('click', () => selectMode('draw'));
tabType.addEventListener('click', () => selectMode('type'));
clearBtn.addEventListener('click', () => sigPad.clear());

// ---------- Validation ----------
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function setInvalid(el, invalid) {
  el.classList.toggle('invalid', invalid);
}

function signatureProvided() {
  return sigMode === 'draw' ? !sigPad.isBlank() : typedInput.value.trim().length >= 2;
}

function validate() {
  let firstBad = null;
  const fail = (el) => { setInvalid(el, true); if (!firstBad) firstBad = el; };

  const fullName = document.getElementById('full_name');
  const contact = document.getElementById('contact_number');
  const email = document.getElementById('email');
  const health = document.getElementById('health_declaration');
  const consent = document.getElementById('consent');

  [fullName, contact, email].forEach((el) => setInvalid(el.closest('.field'), false));
  document.getElementById('declare-health').classList.remove('invalid');
  document.getElementById('declare-consent').classList.remove('invalid');
  fieldSelfie.classList.remove('invalid');
  fieldSig.classList.remove('invalid');

  if (!fullName.value.trim()) fail(fullName.closest('.field'));
  if (!contact.value.trim()) fail(contact.closest('.field'));
  if (email.value.trim() && !emailRe.test(email.value.trim())) fail(email.closest('.field'));
  if (!health.checked) fail(document.getElementById('declare-health'));
  if (!consent.checked) fail(document.getElementById('declare-consent'));
  if (!selfieDataUrl) fail(fieldSelfie);
  if (!signatureProvided()) fail(fieldSig);

  if (firstBad) firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return !firstBad;
}

// Clear a field's error state as the user fixes it.
form.addEventListener('input', (e) => {
  const field = e.target.closest('.field');
  if (field) setInvalid(field, false);
});
document.getElementById('health_declaration').addEventListener('change', () =>
  document.getElementById('declare-health').classList.remove('invalid'));
document.getElementById('consent').addEventListener('change', () =>
  document.getElementById('declare-consent').classList.remove('invalid'));
typedInput.addEventListener('input', () => fieldSig.classList.remove('invalid'));
canvas.addEventListener('mousedown', () => fieldSig.classList.remove('invalid'));
canvas.addEventListener('touchstart', () => fieldSig.classList.remove('invalid'), { passive: true });

// ---------- Status screens ----------
function showStatus(which) {
  form.style.display = which ? 'none' : '';
  statusLoading.classList.toggle('show', which === 'loading');
  statusSuccess.classList.toggle('show', which === 'success');
  statusError.classList.toggle('show', which === 'error');
  if (which === 'success' || which === 'error') {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }
}

retryBtn.addEventListener('click', () => {
  showStatus(null);
  submitBtn.disabled = false;
});

// ---------- Submit ----------
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validate()) return;

  submitBtn.disabled = true;
  stopStream();
  showStatus('loading');

  const fd = new FormData(form);
  const payload = {
    full_name: (fd.get('full_name') || '').toString().trim(),
    contact_number: (fd.get('contact_number') || '').toString().trim(),
    emergency_contact_name: (fd.get('emergency_contact_name') || '').toString().trim(),
    emergency_contact_number: (fd.get('emergency_contact_number') || '').toString().trim(),
    email: (fd.get('email') || '').toString().trim(),
    visit_date: (fd.get('visit_date') || '').toString().trim(),
    health_declaration: document.getElementById('health_declaration').checked,
    consent: document.getElementById('consent').checked,
    date_of_signing: signingDisplay,
    waiver_version: 'daypass-v1',
    selfie: selfieDataUrl,
    signature: {
      type: sigMode,
      data: sigMode === 'draw' ? sigPad.getDataURL() : typedInput.value.trim(),
    },
  };

  // Never strand the visitor on the spinner if the network stalls.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch('/api/submit-daypass-waiver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const result = await res.json().catch(() => ({}));
    if (res.ok && result.success) {
      showStatus('success');
    } else {
      throw new Error(result.message || result.error || 'Server rejected the submission.');
    }
  } catch (err) {
    clearTimeout(timeout);
    console.error('Waiver submission failed:', err);
    const msg = err && err.name === 'AbortError'
      ? 'The connection timed out.'
      : (err && err.message ? err.message : 'We couldn’t submit your waiver.');
    errorText.textContent = msg + ' Please try again, or ask a member of staff for help.';
    submitBtn.disabled = false;
    showStatus('error');
  }
});
