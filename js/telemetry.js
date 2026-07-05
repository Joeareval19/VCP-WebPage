// VCP site telemetry (#52 / [70002]) — anonymous by design.
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

  if (!SUPABASE_ANON_KEY || !window.fetch) {
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
      ua: navigator.userAgent,
      mobile: /Mobi|Android/i.test(navigator.userAgent),
      platform: navigator.platform || null,
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

  // ---- visit duration on tab hide (anon role cannot UPDATE the visit row) ----
  var t0 = Date.now();
  var durationSent = false;
  document.addEventListener("visibilitychange", function () {
    try {
      if (document.visibilityState === "hidden" && !durationSent) {
        durationSent = true;
        event("meta", "visit_duration", Date.now() - t0, null, true);
      }
    } catch (e) { /* fail silent */ }
  });

  // ---- public hook for the voice widget (#43) ----
  window.vcpTrack = function (name, detail) {
    try { event("widget", String(name).slice(0, 120), null, detail || null); } catch (e) { /* fail silent */ }
  };
})();
