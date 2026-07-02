/* Fit Pit admin shell — PIN gate + Class Admin / Analytics tabs.
   Class Admin is the default view; Analytics is initialised lazily the first
   time its tab is opened. */

import { initAnalytics } from './dashboard.js';
import { initClassAdmin } from './classadmin.js';

const BUILTIN_PIN = '2026';

const gate = document.getElementById('pin-gate');
const app = document.getElementById('app');
const pinForm = document.getElementById('pin-form');
const pinInput = document.getElementById('pin-input');
const pinError = document.getElementById('pin-error');
const tabs = document.getElementById('tabs');

let unlocked = false;
let analyticsInit = false;
let contentInit = false;

// Load the live site (in edit mode) into the Website Content iframe. The iframe
// is same-origin, so it shares this session's admin PIN from sessionStorage and
// enters edit mode automatically. Deferred until the tab is first opened.
function initContentTab() {
  const frame = document.getElementById('wc-frame');
  if (frame && !frame.getAttribute('src')) frame.setAttribute('src', '/?edit=1');
}

async function verify(pin) {
  // Prefer the server check (PIN configurable via CLASS_ADMIN_PIN env). If the
  // API can't be reached — e.g. local `vite` dev with no serverless runtime —
  // fall back to the built-in PIN so the UI is still usable.
  try {
    const res = await fetch('/api/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify', pin }),
    });
    if (res.ok) {
      const d = await res.json();
      return !!d.ok;
    }
  } catch {
    /* fall through */
  }
  return pin === BUILTIN_PIN;
}

function unlock(pin) {
  if (unlocked) return;
  unlocked = true;
  try {
    sessionStorage.setItem('fp_admin_pin', pin);
    // Mark this device as an admin device (durable cookie + localStorage).
    // The public-site tracker reads this (same origin) and tags its visits as
    // "excluded", so an admin's own browsing is kept out of the analytics
    // totals automatically — no per-device toggle needed.
    localStorage.setItem('fp_admin_device', '1');
    document.cookie = 'fp_admin_device=1; path=/; max-age=' + 60 * 60 * 24 * 730 + '; SameSite=Lax';
  } catch {
    /* ignore */
  }
  gate.hidden = true;
  app.hidden = false;
  initClassAdmin({ pin });
}

pinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  pinError.hidden = true;
  const pin = pinInput.value.trim();
  const btn = pinForm.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Checking…';
  const ok = await verify(pin);
  btn.disabled = false;
  btn.textContent = 'Unlock';
  if (ok) {
    unlock(pin);
  } else {
    pinError.hidden = false;
    pinInput.value = '';
    pinInput.focus();
  }
});

tabs.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-tab]');
  if (!btn) return;
  const tab = btn.dataset.tab;
  tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
  document.getElementById('tab-classes').hidden = tab !== 'classes';
  document.getElementById('tab-content').hidden = tab !== 'content';
  document.getElementById('tab-analytics').hidden = tab !== 'analytics';
  if (tab === 'analytics' && !analyticsInit) {
    analyticsInit = true;
    initAnalytics();
  }
  if (tab === 'content' && !contentInit) {
    contentInit = true;
    initContentTab();
  }
});

// Restore an unlock from earlier in this browser session.
let remembered = null;
try {
  remembered = sessionStorage.getItem('fp_admin_pin');
} catch {
  /* ignore */
}
if (remembered) unlock(remembered);
else pinInput.focus();
