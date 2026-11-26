/* ============================================================
   Fit Pit — membership sign-up: ID photo + submission helpers
   ------------------------------------------------------------
   Built for a phone on a weak connection:
     - prepareIdFile() shrinks the ID photo in the browser before it is sent. The whole
       sign-up travels as one request and Vercel refuses anything over 4.5 MB, so a
       normal phone photo (3–12 MB) could never be sent as it was taken.
     - postAgreement() retries a send that drops, gives up on one that stalls, and
       reports failures with a reason the form can explain in plain words.
   ============================================================ */

// What an ID photo is shrunk towards. Base64 adds a third, so 1.2 MB travels as ~1.6 MB.
export const ID_TARGET_BYTES = 1_200_000;
// A PDF can't be shrunk here; bigger ones would not fit in the request.
export const ID_MAX_PDF_BYTES = 2_500_000;
// Larger than any phone photo — beyond this the browser would struggle to open it.
const ID_MAX_INPUT_BYTES = 60_000_000;

// Tried in order until the photo is under the target.
const SHRINK_STEPS = [
  { edge: 2000, quality: 0.8 },
  { edge: 1600, quality: 0.72 },
  { edge: 1200, quality: 0.65 },
  { edge: 900, quality: 0.6 },
];

export class IdFileError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'IdFileError';
    this.code = code;
  }
}

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new IdFileError('unreadable', 'We could not read that file. Please try again, or take a new photo.'));
    reader.readAsDataURL(blob);
  });

const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const done = (fn, arg) => { clearTimeout(timer); fn(arg); };
    const timer = setTimeout(() => done(reject, new Error('decode timed out')), 20_000);
    img.onload = () => done(resolve, { img, url });
    img.onerror = () => { URL.revokeObjectURL(url); done(reject, new Error('decode failed')); };
    img.src = url;
  });

const drawJpeg = (img, edge, quality) =>
  new Promise((resolve) => {
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = Math.min(1, edge / longest);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return resolve(null);
    // JPEG has no transparency: paint white first so a see-through PNG doesn't turn black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });

const isPdf = (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
const isImage = (file) => /^image\//i.test(file.type) || /\.(jpe?g|png|webp|heic|heif|bmp)$/i.test(file.name || '');
const jpegName = (name) => `${String(name || 'id').replace(/\.[^.]+$/, '') || 'id'}.jpg`;

/** Gets an ID photo or PDF ready to send. Photos of any size or format the phone can open
 *  are turned into a compact JPEG; small JPEG/PNG files go as they are.
 *  Resolves { dataUrl, filename, mimeType, bytes, originalBytes }; rejects with an
 *  IdFileError whose message can be shown to the member. */
export async function prepareIdFile(file) {
  if (!file) throw new IdFileError('unreadable', 'No file was chosen.');
  if (file.size > ID_MAX_INPUT_BYTES) {
    throw new IdFileError('too_large', 'That file is too big. Please take a new photo of your ID instead.');
  }

  if (isPdf(file)) {
    if (file.size > ID_MAX_PDF_BYTES) {
      throw new IdFileError('too_large', 'That PDF is too big to send (max 2.5 MB). Please take a photo of your ID instead.');
    }
    return { dataUrl: await blobToDataUrl(file), filename: file.name, mimeType: 'application/pdf', bytes: file.size, originalBytes: file.size };
  }

  if (!isImage(file)) {
    throw new IdFileError('unsupported', 'Please use a photo (JPG, PNG) or a PDF of your ID.');
  }

  const plain = /^image\/(jpeg|png)$/i.test(file.type);
  // Already small and in a format the gym's system can file: send it untouched.
  if (plain && file.size <= 600_000) {
    return { dataUrl: await blobToDataUrl(file), filename: file.name, mimeType: file.type.toLowerCase(), bytes: file.size, originalBytes: file.size };
  }

  let decoded;
  try {
    decoded = await loadImage(file);
  } catch {
    // The browser can't open it (e.g. an iPhone HEIC photo on another browser, or a
    // picture too large for this phone's memory). A plain photo that still fits goes as is.
    if (plain && file.size <= ID_MAX_PDF_BYTES) {
      return { dataUrl: await blobToDataUrl(file), filename: file.name, mimeType: file.type.toLowerCase(), bytes: file.size, originalBytes: file.size };
    }
    throw new IdFileError('unsupported', 'This phone could not open that photo. Please take a new photo of your ID with the camera.');
  }

  try {
    let best = null;
    for (const step of SHRINK_STEPS) {
      const blob = await drawJpeg(decoded.img, step.edge, step.quality);
      if (!blob || !blob.size) continue;
      best = blob;
      if (blob.size <= ID_TARGET_BYTES) break;
    }
    if (!best || best.size > ID_MAX_PDF_BYTES) {
      throw new IdFileError('too_large', 'That photo could not be made small enough to send. Please take a new photo of your ID.');
    }
    return { dataUrl: await blobToDataUrl(best), filename: jpegName(file.name), mimeType: 'image/jpeg', bytes: best.size, originalBytes: file.size };
  } finally {
    URL.revokeObjectURL(decoded.url);
  }
}

export const formatBytes = (bytes) =>
  bytes >= 1_000_000 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// ---- submission -------------------------------------------------------------

export class SubmitError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SubmitError';
    this.code = code; // offline | timeout | network | too_large | server | rejected
  }
}

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const RETRYABLE = new Set(['offline', 'network', 'server']);

async function postOnce(url, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') throw new SubmitError('timeout', 'timed out');
    throw new SubmitError(isOnline() ? 'network' : 'offline', String((err && err.message) || err));
  } finally {
    clearTimeout(timer);
  }

  // Vercel's own refusals (too large, timed out, crashed) are not JSON.
  const text = await response.text().catch(() => '');
  let result = null;
  try { result = text ? JSON.parse(text) : null; } catch { /* not JSON */ }

  if (response.ok && result && result.success) return result;
  if (response.status === 413) throw new SubmitError('too_large', 'payload too large');
  if (response.status >= 500 || response.status === 429 || response.status === 408) {
    throw new SubmitError('server', (result && result.error) || `server error ${response.status}`);
  }
  throw new SubmitError('rejected', (result && result.error) || 'The form could not be accepted.');
}

/** Sends the sign-up. A dropped connection is retried (the server recognises a repeat of
 *  the same `submission_id`, so a retry can never create the member twice).
 *  onRetry(nextAttempt, attempts) is called before each retry. Rejects with a SubmitError. */
export async function postAgreement(payload, { attempts = 3, backoffMs = [2000, 5000], onRetry, url = '/api/submit-agreement' } = {}) {
  // Slow links get longer for a bigger payload: 45 s plus 1 s per 5 KB, at most 3 minutes.
  const size = JSON.stringify(payload).length;
  const timeoutMs = Math.min(180_000, 45_000 + Math.round(size / 5));
  for (let attempt = 1; ; attempt++) {
    try {
      return await postOnce(url, JSON.stringify({ ...payload, attempt }), timeoutMs);
    } catch (err) {
      const failure = err instanceof SubmitError ? err : new SubmitError('network', String((err && err.message) || err));
      if (attempt >= attempts || !RETRYABLE.has(failure.code)) throw failure;
      if (onRetry) onRetry(attempt + 1, attempts);
      await sleep(backoffMs[Math.min(attempt - 1, backoffMs.length - 1)]);
    }
  }
}

/** What to tell the member when the sign-up could not be sent. */
export function submitFailureMessage(err, { hasId = false } = {}) {
  const code = err && err.code;
  const kept = 'Nothing you entered has been lost.';
  switch (code) {
    case 'offline':
      return `Your phone is not connected to the internet. Check your Wi-Fi or mobile data, then tap Try Again. ${kept}`;
    case 'timeout':
      return `The internet connection is too slow to send your form right now. ${kept} Tap Try Again${hasId ? ', or send it without the ID photo' : ''}.`;
    case 'network':
      return `The internet connection dropped while sending your form. We tried a few times. ${kept} Tap Try Again${hasId ? ', or send it without the ID photo' : ''}.`;
    case 'too_large':
      return hasId
        ? 'Your ID file is too big to send. Tap “Send without ID photo” and show your ID at the front desk instead.'
        : `Your form was too big to send. ${kept} Please tap Try Again.`;
    case 'server':
      return `Something went wrong on our side. ${kept} Please tap Try Again in a moment.`;
    default:
      return (err && err.message) || 'There was a problem submitting your agreement. Please try again.';
  }
}

/** A random id for this sign-up, so the server can tell a retry from a new member. */
export function newSubmissionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}
