// VCP site telemetry (#52 / [70002]; v2 engagement + hygiene #64 / [70004]) —
// anonymous by design.
// Writes visits + events to Supabase via the publishable (anon) key, which is
// public-by-design and INSERT-only under RLS: the browser can add rows but
// can never read, change, or delete anything.
// Fail-silent contract: telemetry must NEVER break the page or spam the
// console. Every network call is fire-and-forget; every handler is try/caught.
(function () {
  "use strict";

  var SUPABASE_URL = "https://qaorlbgrkpldcatyntlw.supabase.co";
  // Publishable key: public-by-design, INSERT-only under RLS (verified
  // 2026-07-05 — anon SELECT returns zero rows). Empty string = disabled.
  var SUPABASE_ANON_KEY = "sb_publishable_MZQT-cWL_j0X4KNdqx4mDA_MgTqy073";

  // Localhost/file guard (#64): dev browsing must never write prod rows.
  if (!SUPABASE_ANON_KEY || !window.fetch ||
      /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) ||
      location.protocol === "file:") {
    // Still expose the widget hook so #43's code can call it unconditionally.
    window.vcpTrack = function () {};
    return;
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  // visitor_id: first-party cookie, 1 year, pseudonymous (random UUID).
  function visitorId() {
    try {
      var m = document.cookie.match(/(?:^|;\s*)vcp_vid=([0-9a-f-]{36})/);
      if (m) return m[1];
      var id = uuid();
      document.cookie = "vcp_vid=" + id + "; max-age=31536000; path=/; SameSite=Lax";
      return id;
    } catch (e) { return uuid(); }
  }

  // session_id: per tab-session.
  function sessionId() {
    try {
      var id = sessionStorage.getItem("vcp_sid");
      if (!id) { id = uuid(); sessionStorage.setItem("vcp_sid", id); }
      return id;
    } catch (e) { return uuid(); }
  }

  var VID = visitorId();
  var SID = sessionId();
  var PAGE = location.pathname;

  // Hygiene flags (#64): stored on the visit row, excluded in analysis via a
  // session_id join. dev = a vcp_dev=1 cookie you set once in your own
  // browser; bot = automation UA or webdriver-driven browser (agent QA runs).
  var DEV = /(?:^|;\s*)vcp_dev=1/.test(document.cookie);
  var BOT = !!navigator.webdriver ||
    /bot|crawler|spider|headless|lighthouse|prerender/i.test(navigator.userAgent);

  function post(table, row, keepalive) {
    try {
      fetch(SUPABASE_URL + "/rest/v1/" + table, {
        method: "POST",
        keepalive: !!keepalive,
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: "Bearer " + SUPABASE_ANON_KEY,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(row),
      }).catch(function () {});
    } catch (e) { /* fail silent */ }
  }

  function event(type, name, value, detail, keepalive) {
    post("vcp_site_events", {
      visitor_id: VID, session_id: SID, page: PAGE,
      event_type: type, name: name,
      value: typeof value === "number" ? value : null,
      detail: detail || null,
    }, keepalive);
  }

  // ---- page view ----
  function utmParams() {
    try {
      var out = {}, found = false;
      new URLSearchParams(location.search).forEach(function (v, k) {
        if (/^utm_/.test(k)) { out[k] = v; found = true; }
      });
      return found ? out : null;
    } catch (e) { return null; }
  }

  post("vcp_site_visits", {
    visitor_id: VID, session_id: SID, page: PAGE,
    referrer: document.referrer || null,
    utm: utmParams(),
    device: {
      v: 2,
      ua: navigator.userAgent,
      mobile: /Mobi|Android/i.test(navigator.userAgent),
      platform: navigator.platform || null,
      dev: DEV,
      bot: BOT,
      viewport: window.innerWidth + "x" + window.innerHeight,
      connection: (navigator.connection && navigator.connection.effectiveType) || null,
      dark: !!(window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches),
      reduced_motion: !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches),
    },
    screen: window.screen ? screen.width + "x" + screen.height : null,
    language: navigator.language || null,
    timezone: (function () {
      try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return null; }
    })(),
  });

  // ---- performance ----
  window.addEventListener("load", function () {
    try {
      var nav = performance.getEntriesByType("navigation")[0];
      if (nav) {
        event("perf", "page_load", Math.round(nav.loadEventEnd), {
          ttfb: Math.round(nav.responseStart),
          dom_content_loaded: Math.round(nav.domContentLoadedEventEnd),
        });
      }
    } catch (e) { /* fail silent */ }
  });

  // ---- interactions: nav links, buttons, anything opting in via data-track ----
  document.addEventListener("click", function (ev) {
    try {
      var el = ev.target && ev.target.closest && ev.target.closest("a[href], button, [data-track]");
      if (!el) return;
      var name = el.getAttribute("data-track") ||
        (el.tagName === "A" ? "link:" + el.getAttribute("href") : "button:" + (el.textContent || "").trim().slice(0, 40));
      event("interaction", name.slice(0, 120), null, { tag: el.tagName.toLowerCase() });
    } catch (e) { /* fail silent */ }
  }, { passive: true });

  // ---- errors ----
  window.addEventListener("error", function (ev) {
    try {
      event("error", String(ev.message || "script error").slice(0, 200), null, {
        source: ev.filename || null, line: ev.lineno || null,
      });
    } catch (e) { /* fail silent */ }
  });
  window.addEventListener("unhandledrejection", function (ev) {
    try {
      event("error", ("unhandledrejection: " + String(ev.reason)).slice(0, 200), null, null);
    } catch (e) { /* fail silent */ }
  });

  // ---- engaged time (#64): counts only visible + recently-active time ----
  // A 5s tick accrues engaged ms only while the tab is visible AND there was
  // human input in the last 30s — an idle open tab accrues nothing.
  var lastActivity = 0; // no input yet — an untouched tab accrues nothing
  function noteActivity() { lastActivity = Date.now(); }
  ["mousemove", "scroll", "keydown", "touchstart", "click"].forEach(function (t) {
    window.addEventListener(t, noteActivity, { passive: true });
  });
  var engagedMs = 0;
  setInterval(function () {
    try {
      if (document.visibilityState === "visible" && Date.now() - lastActivity <= 30000) {
        engagedMs += 5000;
      }
    } catch (e) { /* fail silent */ }
  }, 5000);

  // ---- scroll depth (#64): reading proxy, each milestone once per view ----
  var depthSent = {};
  function checkDepth() {
    try {
      var doc = document.documentElement;
      var seen = ((window.scrollY || doc.scrollTop || 0) + window.innerHeight) /
        Math.max(doc.scrollHeight, 1) * 100;
      [25, 50, 75, 100].forEach(function (m) {
        if (seen >= m - 0.5 && !depthSent[m]) {
          depthSent[m] = true;
          event("interaction", "scroll_depth", m, null);
        }
      });
    } catch (e) { /* fail silent */ }
  }
  var depthQueued = false;
  window.addEventListener("scroll", function () {
    try {
      if (depthQueued) return;
      depthQueued = true;
      var run = function () { depthQueued = false; checkDepth(); };
      if (window.requestAnimationFrame) window.requestAnimationFrame(run);
      else window.setTimeout(run, 0);
    } catch (e) { /* fail silent */ }
  }, { passive: true });
  window.addEventListener("load", checkDepth); // pages that fit one screen report 100

  // ---- Core Web Vitals (#64): observed continuously, sent once on hide ----
  var lcpMs = null, clsScore = 0, inpMs = null;
  try {
    new PerformanceObserver(function (list) {
      var en = list.getEntries();
      if (en.length) lcpMs = Math.round(en[en.length - 1].startTime);
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch (e) { /* entry type unsupported */ }
  try {
    new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (en) {
        if (!en.hadRecentInput) clsScore += en.value;
      });
    }).observe({ type: "layout-shift", buffered: true });
  } catch (e) { /* entry type unsupported */ }
  try {
    new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (en) {
        if (!en.interactionId) return; // hover/pointer noise, not an interaction
        if (inpMs === null || en.duration > inpMs) inpMs = Math.round(en.duration);
      });
    }).observe({ type: "event", buffered: true, durationThreshold: 40 });
  } catch (e) { /* entry type unsupported */ }

  // ---- flush on tab hide: the anon role cannot UPDATE rows, so everything
  // time-based leaves as delta/final-value events (keepalive survives close).
  // engaged_time is a DELTA per hide (sum per session in SQL); duration and
  // vitals are finals, sent once. cls omitted when 0 — absent row means 0. ----
  var t0 = Date.now();
  var durationSent = false;
  document.addEventListener("visibilitychange", function () {
    try {
      if (document.visibilityState !== "hidden") return;
      if (engagedMs > 0) {
        event("meta", "engaged_time", engagedMs, null, true);
        engagedMs = 0;
      }
      if (!durationSent) {
        durationSent = true;
        event("meta", "visit_duration", Date.now() - t0, null, true);
        if (lcpMs !== null) event("perf", "lcp", lcpMs, null, true);
        if (clsScore > 0) event("perf", "cls", Math.round(clsScore * 1000) / 1000, null, true);
        if (inpMs !== null) event("perf", "inp", inpMs, null, true);
      }
    } catch (e) { /* fail silent */ }
  });

  // ---- copy (#64): what readers lift off a page is the strongest
  // content-mattered signal a research portfolio gets ----
  document.addEventListener("copy", function () {
    try {
      var sel = String(window.getSelection ? window.getSelection() : "");
      if (!sel) return;
      event("interaction", "copy", sel.length, { sample: sel.slice(0, 120) });
    } catch (e) { /* fail silent */ }
  });

  // ---- rage clicks (#64): 3+ clicks in 700ms within ~30px — frustration
  // signal for broken/unresponsive UI nobody files feedback about ----
  var clicks = [];
  document.addEventListener("click", function (ev) {
    try {
      var now = Date.now();
      clicks.push({ t: now, x: ev.clientX, y: ev.clientY });
      clicks = clicks.filter(function (c) { return now - c.t <= 700; });
      if (clicks.length >= 3 && clicks.every(function (c) {
        return Math.abs(c.x - ev.clientX) <= 30 && Math.abs(c.y - ev.clientY) <= 30;
      })) {
        clicks = [];
        event("interaction", "rage_click", null, {
          tag: ev.target && ev.target.tagName ? ev.target.tagName.toLowerCase() : null,
          id: (ev.target && ev.target.id) || null,
        });
      }
    } catch (e) { /* fail silent */ }
  }, { passive: true });

  // ---- public hook for the voice widget (#43) ----
  window.vcpTrack = function (name, detail) {
    try { event("widget", String(name).slice(0, 120), null, detail || null); } catch (e) { /* fail silent */ }
  };
})();
