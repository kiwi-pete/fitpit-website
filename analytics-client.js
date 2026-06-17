/* ============================================================
   Fit Pit — first-party, cookie-free analytics (client)
   ------------------------------------------------------------
   - No cookies. A random session id lives in sessionStorage
     (cleared when the tab closes) only to group events and
     avoid double-counting.
   - "Unique visitors" use a daily-rotating anonymous SHA-256
     hash of non-identifying signals (date + UA + language +
     screen + timezone). No personal data is stored, no raw IP.
   - The admin dashboard (/secretadminlink) is never tracked.
   - Bots / crawlers / headless browsers are skipped.
   - Country is resolved server-side from the edge geo header
     (see /api/geo) — no IP is ever stored.
   ============================================================ */

(() => {
  'use strict';

  const ADMIN_PATH = '/secretadminlink';
  const ENDPOINT = '/api/track';

  // --- Hard guards: never track the admin page or non-browser agents ---
  if (typeof window === 'undefined') return;
  if (location.pathname.toLowerCase().startsWith(ADMIN_PATH)) return;

  const ua = navigator.userAgent || '';
  const isBot =
    navigator.webdriver === true ||
    /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora|pinterest|vkshare|whatsapp|telegram|headless|phantomjs|puppeteer|playwright|lighthouse|gtmetrix|pingdom|monitor|preview|prerender/i.test(
      ua
    );
  if (isBot) return;

  // ---------------------------------------------------------------
  // Logical pages / sections of the Fit Pit single-page site.
  // Keys are stable; titles are the human labels shown in the dashboard.
  // ---------------------------------------------------------------
  const PAGES = [
    { key: 'home', id: 'hero', title: 'Home' },
    { key: 'passes', id: 'passes', title: 'Memberships & Passes' },
    { key: 'personal-training', id: 'personal-training', title: 'Personal Training' },
    { key: 'classes', id: 'classes', title: 'Classes' },
    { key: 'facility', id: 'facility', title: 'Facility' },
    { key: 'about', id: 'about', title: 'About' },
    { key: 'shop', id: 'shop', title: 'Shop' },
    { key: 'clinic', id: 'clinic', title: 'Medical Clinic' },
    { key: 'contact', id: 'contact', title: 'Contact' },
  ];
  const idToPage = {};
  PAGES.forEach((p) => (idToPage[p.id] = p));
  const titleOf = (key) => (PAGES.find((p) => p.key === key) || {}).title || key;

  // ---------------------------------------------------------------
  // Session id (sessionStorage) + helpers
  // ---------------------------------------------------------------
  const uuid = () =>
    (crypto.randomUUID && crypto.randomUUID()) ||
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });

  let sessionId;
  try {
    sessionId = sessionStorage.getItem('fp_sid');
    if (!sessionId) {
      sessionId = uuid();
      sessionStorage.setItem('fp_sid', sessionId);
    }
  } catch {
    sessionId = uuid();
  }
  const sessionAlreadyStarted = (() => {
    try {
      if (sessionStorage.getItem('fp_started')) return true;
      sessionStorage.setItem('fp_started', '1');
      return false;
    } catch {
      return false;
    }
  })();

  // ---------------------------------------------------------------
  // Daily-rotating anonymous visitor hash (no personal data stored)
  // ---------------------------------------------------------------
  async function computeVisitorHash() {
    const day = new Date().toISOString().slice(0, 10); // UTC day
    const raw = [
      day,
      ua,
      navigator.language || '',
      `${screen.width}x${screen.height}`,
      `${screen.colorDepth || ''}`,
      Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    ].join('|');
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 32);
    } catch {
      // Fallback: non-crypto hash, still anonymous and daily-rotating.
      let h = 0;
      for (let i = 0; i < raw.length; i++) h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
      return 'f' + (h >>> 0).toString(16) + day.replace(/-/g, '');
    }
  }

  // ---------------------------------------------------------------
  // Environment classification
  // ---------------------------------------------------------------
  function classifyDevice() {
    const touch = (navigator.maxTouchPoints || 0) > 1;
    const isTablet =
      /ipad/i.test(ua) ||
      (/android/i.test(ua) && !/mobile/i.test(ua)) ||
      (/macintosh/i.test(ua) && touch); // iPadOS reports as Mac
    if (isTablet) return 'tablet';
    if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(ua)) return 'mobile';
    return 'desktop';
  }

  function classifyBrowser() {
    if (/edg\//i.test(ua)) return 'edge';
    if (/firefox|fxios/i.test(ua)) return 'firefox';
    if (/chrome|crios|chromium/i.test(ua) && !/edg\//i.test(ua) && !/opr\//i.test(ua)) return 'chrome';
    if (/safari/i.test(ua) && !/chrome|crios|android/i.test(ua)) return 'safari';
    return 'other';
  }

  function classifyOS() {
    if (/windows/i.test(ua)) return 'Windows';
    if (/android/i.test(ua)) return 'Android';
    if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
    if (/mac os x/i.test(ua)) return 'macOS';
    if (/linux/i.test(ua)) return 'Linux';
    return 'Other';
  }

  function screenBucket(w) {
    if (w < 576) return 'small-mobile';
    if (w < 992) return 'tablet';
    if (w < 1440) return 'desktop';
    return 'large-desktop';
  }

  function referrerDomain() {
    try {
      if (!document.referrer) return '';
      const d = new URL(document.referrer).hostname.replace(/^www\./, '');
      if (d === location.hostname.replace(/^www\./, '')) return ''; // internal
      return d;
    } catch {
      return '';
    }
  }

  function sourceGroup(refDomain, utmSource) {
    const s = (utmSource || refDomain || '').toLowerCase();
    if (!s) return 'direct';
    if (/google|bing|duckduckgo|yahoo|ecosia|baidu|yandex/.test(s)) return 'google';
    if (/facebook|fb\.|instagram|t\.co|twitter|x\.com|linkedin|youtube|tiktok|pinterest|reddit|whatsapp|snapchat/.test(s))
      return 'social';
    if (refDomain) return 'referral';
    return 'other';
  }

  const params = new URLSearchParams(location.search);
  const utm = {
    utm_source: params.get('utm_source') || null,
    utm_medium: params.get('utm_medium') || null,
    utm_campaign: params.get('utm_campaign') || null,
  };
  const refDomain = referrerDomain();

  // ---------------------------------------------------------------
  // Event queue + flushing
  // ---------------------------------------------------------------
  let visitorHash = null;
  let sessionPayload = null; // sent once
  const queue = { pageViews: [], events: [], vitals: [] };

  function buildBody(includeSession) {
    return {
      v: 1,
      session_id: sessionId,
      visitor_hash: visitorHash,
      session: includeSession ? sessionPayload : null,
      pageViews: queue.pageViews.splice(0),
      events: queue.events.splice(0),
      vitals: queue.vitals.splice(0),
    };
  }

  function hasPayload(body) {
    return body.session || body.pageViews.length || body.events.length || body.vitals.length;
  }

  let sessionSent = sessionAlreadyStarted; // if already started in this tab, don't resend session row
  function flush(useBeacon) {
    if (!visitorHash) return; // not initialised yet
    const includeSession = !sessionSent && !!sessionPayload;
    const body = buildBody(includeSession);
    if (!hasPayload(body)) return;
    if (includeSession) sessionSent = true;
    const json = JSON.stringify(body);
    try {
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([json], { type: 'application/json' }));
      } else {
        fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: json,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      /* swallow — analytics must never break the site */
    }
  }

  let flushTimer = null;
  function scheduleFlush(delay = 800) {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => flush(false), delay);
  }

  // ---------------------------------------------------------------
  // Page views (one per section per session — impression based)
  // ---------------------------------------------------------------
  const seenPages = new Set();
  function recordPageView(key) {
    if (!key || seenPages.has(key)) return;
    seenPages.add(key);
    queue.pageViews.push({
      page: key,
      title: titleOf(key),
      path: location.pathname + '#' + key,
    });
    scheduleFlush(400);
  }

  function pageFromHash() {
    const id = (location.hash || '').replace('#', '');
    return (idToPage[id] && idToPage[id].key) || 'home';
  }

  // ---------------------------------------------------------------
  // Active time per page (only while tab is visible)
  // ---------------------------------------------------------------
  const timeByPage = {}; // pending (un-flushed) seconds
  let currentPageKey = pageFromHash();

  function tickActive() {
    if (document.visibilityState === 'visible') {
      timeByPage[currentPageKey] = (timeByPage[currentPageKey] || 0) + 1;
    }
  }

  function flushActiveTime() {
    Object.keys(timeByPage).forEach((key) => {
      const secs = timeByPage[key];
      if (secs > 0) {
        queue.events.push({ type: 'active_time', page: key, value: secs });
        timeByPage[key] = 0;
      }
    });
  }

  // Observe which section is most visible -> attribute active time + count impression
  function initSectionObserver() {
    const ratios = {};
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const page = idToPage[e.target.id];
          if (!page) return;
          ratios[page.key] = e.isIntersecting ? e.intersectionRatio : 0;
          if (e.intersectionRatio >= 0.5) recordPageView(page.key);
        });
        // pick most-visible section as the current page for time attribution
        let best = currentPageKey,
          bestR = 0;
        Object.keys(ratios).forEach((k) => {
          if (ratios[k] > bestR) {
            bestR = ratios[k];
            best = k;
          }
        });
        if (bestR > 0) currentPageKey = best;
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    PAGES.forEach((p) => {
      const el = document.getElementById(p.id);
      if (el) obs.observe(el);
    });
  }

  // ---------------------------------------------------------------
  // CTA / outbound / enquiry click tracking (delegated)
  // ---------------------------------------------------------------
  const ENQUIRY_KEYWORDS =
    /join|sign\s?up|free\s?trial|get\s?started|day\s?pass|membership|enquir|book|contact|trial|personal\s?training/i;

  function labelFor(el, anchor) {
    const explicit = el.getAttribute && (el.getAttribute('data-cta') || el.getAttribute('aria-label'));
    if (explicit) return explicit.trim();
    if (el.dataset && el.dataset.pass) return 'Join — ' + el.dataset.pass;
    const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (txt) return txt.slice(0, 60);
    if (anchor) {
      try {
        return new URL(anchor.href).hostname;
      } catch {
        return anchor.href;
      }
    }
    return 'CTA';
  }

  document.addEventListener(
    'click',
    (ev) => {
      const el = ev.target.closest && ev.target.closest('a, button, [data-cta], .join-btn');
      if (!el) return;
      const page = currentPageKey;
      const anchor = el.closest('a');
      const href = anchor && anchor.getAttribute('href');
      const label = labelFor(el, anchor);

      // Outbound + enquiry classification
      if (href) {
        if (/^https?:\/\/wa\.me|^https?:\/\/(api\.)?whatsapp\.com|wa\.me/i.test(href)) {
          queue.events.push({ type: 'outbound_click', page, label: 'WhatsApp', detail: 'whatsapp' });
          queue.events.push({ type: 'enquiry_start', page, label: 'WhatsApp' });
          scheduleFlush(200);
          return;
        }
        if (/^tel:/i.test(href)) {
          queue.events.push({ type: 'outbound_click', page, label: 'Phone', detail: 'phone' });
          queue.events.push({ type: 'enquiry_start', page, label: 'Phone' });
          scheduleFlush(200);
          return;
        }
        if (/^mailto:/i.test(href)) {
          queue.events.push({ type: 'outbound_click', page, label: 'Email', detail: 'email' });
          queue.events.push({ type: 'enquiry_start', page, label: 'Email' });
          scheduleFlush(200);
          return;
        }
        if (/^https?:\/\//i.test(href)) {
          let host = href;
          try {
            host = new URL(href).hostname.replace(/^www\./, '');
          } catch {}
          if (host !== location.hostname.replace(/^www\./, '')) {
            queue.events.push({ type: 'outbound_click', page, label: host, detail: 'external' });
            scheduleFlush(400);
            return;
          }
        }
      }

      // Internal CTA buttons / links
      const isCta =
        (el.classList &&
          (el.classList.contains('btn') ||
            el.classList.contains('join-btn') ||
            el.classList.contains('nav-cta'))) ||
        (el.getAttribute && el.getAttribute('data-cta'));
      if (isCta) {
        queue.events.push({ type: 'cta_click', page, label });
        if (ENQUIRY_KEYWORDS.test(label)) {
          queue.events.push({ type: 'enquiry_start', page, label });
        }
        scheduleFlush(400);
      }
    },
    true
  );

  // Public hook for explicit conversion / custom events (used by main.js)
  window.fpTrack = function (type, opts = {}) {
    try {
      queue.events.push({
        type: String(type),
        page: opts.page || currentPageKey,
        label: opts.label || null,
        detail: opts.detail || null,
        value: typeof opts.value === 'number' ? opts.value : null,
      });
      flush(false);
    } catch {
      /* ignore */
    }
  };

  // ---------------------------------------------------------------
  // Core Web Vitals (best-effort, no library)
  // ---------------------------------------------------------------
  function initWebVitals() {
    const vitals = {};
    const push = (metric, value) => {
      if (value == null || isNaN(value)) return;
      vitals[metric] = value;
    };
    // TTFB + FCP
    try {
      const nav = performance.getEntriesByType('navigation')[0];
      if (nav) push('TTFB', Math.max(0, nav.responseStart));
    } catch {}
    try {
      new PerformanceObserver((list) => {
        list.getEntries().forEach((e) => {
          if (e.name === 'first-contentful-paint') push('FCP', e.startTime);
        });
      }).observe({ type: 'paint', buffered: true });
    } catch {}
    // LCP
    try {
      const po = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) push('LCP', last.renderTime || last.loadTime || last.startTime);
      });
      po.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {}
    // CLS
    try {
      let cls = 0;
      new PerformanceObserver((list) => {
        list.getEntries().forEach((e) => {
          if (!e.hadRecentInput) cls += e.value;
        });
        push('CLS', cls);
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {}
    // INP (approx: worst interaction latency)
    try {
      let inp = 0;
      new PerformanceObserver((list) => {
        list.getEntries().forEach((e) => {
          if (e.interactionId && e.duration > inp) inp = e.duration;
        });
        if (inp) push('INP', inp);
      }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
    } catch {}

    const reportVitals = () => {
      Object.keys(vitals).forEach((metric) => {
        queue.vitals.push({ metric, value: Math.round(vitals[metric] * 100) / 100, page: 'home' });
        delete vitals[metric];
      });
    };
    // Report on the way out
    addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') reportVitals();
    });
    addEventListener('pagehide', reportVitals);
  }

  // ---------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------
  async function boot() {
    visitorHash = await computeVisitorHash();

    // Country (server-side geo header, no IP stored). Best-effort.
    let country = null;
    try {
      const r = await fetch('/api/geo', { headers: { Accept: 'application/json' } });
      if (r.ok) country = (await r.json()).country || null;
    } catch {
      /* ignore */
    }

    sessionPayload = {
      referrer: document.referrer ? document.referrer.slice(0, 300) : null,
      referrer_domain: refDomain || null,
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
      source_group: sourceGroup(refDomain, utm.utm_source),
      device_type: classifyDevice(),
      browser: classifyBrowser(),
      os: classifyOS(),
      screen_bucket: screenBucket(window.innerWidth || screen.width),
      viewport_w: window.innerWidth || null,
      viewport_h: window.innerHeight || null,
      country,
      landing_path: location.pathname || '/',
    };

    // initial page view + observers
    recordPageView(pageFromHash());
    initSectionObserver();
    flush(false); // persist session + landing view promptly

    // route changes
    addEventListener('hashchange', () => {
      currentPageKey = pageFromHash();
      recordPageView(currentPageKey);
    });

    // active time accounting
    setInterval(tickActive, 1000);
    setInterval(() => {
      flushActiveTime();
      flush(false);
    }, 15000);

    initWebVitals();

    // flush on the way out
    addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushActiveTime();
        flush(true);
      }
    });
    addEventListener('pagehide', () => {
      flushActiveTime();
      flush(true);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
