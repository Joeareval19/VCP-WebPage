/* Page transition (issues #57, #89, #107).
   One system owns all internal navigation:
   - FIRST visit to a page this session → the title dip (the page name
     fades in and out over black). Nav tabs use the link text; other
     internal links use their data-dip-title (e.g. a project name).
   - REPEAT visit (or a link with no title) → a plain cross-fade: a
     scrim veil fades up over the leaving page, then fades away on the
     arriving one. No triangle, no title.
   Overlay visuals live in css/components.css (html.vcp-dip for the
   title dip, html.vcp-fade for the cross-fade veil). The pre-paint
   snippets in each page's <head> raise the correct overlay before first
   paint via a sessionStorage handshake. Under prefers-reduced-motion
   navigation is native and immediate. */
(function () {
  var TITLE_KEY = 'vcp-dip-title';  /* destination title for the dip */
  var FADE_KEY = 'vcp-fade';        /* '1' → destination raises the veil */
  var SEEN_KEY = 'vcp-dip-seen';    /* pages visited this session */

  /* Handoff: navigate just after --dur-dip-in (320ms) completes; the
     --hold breathe animation's -340ms delay in components.css matches. */
  var DIP_NAV_DELAY = 340;
  var MIN_HOLD = 700;   /* ms the title stays before the fade-away starts */
  var FADE_NAV_DELAY = 250;  /* --dur-med: veil fully up before leaving */
  var FADE_REVEAL = 300;     /* ms to hold+lift the arriving veil */

  var root = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* First-visit gate (issue #89): key on pathname + search so each
     ?slug= project detail counts as its own page. */
  function norm(url) {
    var path = url.pathname.replace(/\/index\.html$/, '/') || '/';
    return path + (url.search || '');
  }

  function seenPages() {
    try { return JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]'); }
    catch (e) { return []; }
  }

  function markSeen(key) {
    try {
      var seen = seenPages();
      if (seen.indexOf(key) === -1) {
        seen.push(key);
        sessionStorage.setItem(SEEN_KEY, JSON.stringify(seen));
      }
    } catch (e) {}
  }

  /* Every load counts as a visit, including direct entry — landing on a
     page means navigating back to it later shows no dip. */
  markSeen(norm(window.location));

  function clearDip() {
    root.classList.remove('vcp-dip', 'vcp-dip--in', 'vcp-dip--hold', 'vcp-dip--out');
    root.removeAttribute('data-dip-title');
  }

  /* ── Destination side ────────────────────────────────────────────── */

  /* Title dip: pre-paint snippet set --hold before first paint. */
  if (root.classList.contains('vcp-dip--hold')) {
    try { sessionStorage.removeItem(TITLE_KEY); } catch (e) {}
    var dipArrived = Date.now();
    var fadeAway = function () {
      setTimeout(function () {
        root.classList.remove('vcp-dip--hold');
        root.classList.add('vcp-dip--out');
        setTimeout(clearDip, 1250); /* --dur-dip-out + margin */
      }, Math.max(0, MIN_HOLD - (Date.now() - dipArrived)));
    };
    if (document.readyState === 'complete') fadeAway();
    else window.addEventListener('load', fadeAway);
  }

  /* Cross-fade: pre-paint snippet set html.vcp-fade (veil up) before
     first paint. Lift it once the page has settled. */
  if (root.classList.contains('vcp-fade')) {
    try { sessionStorage.removeItem(FADE_KEY); } catch (e) {}
    var reveal = function () {
      requestAnimationFrame(function () {
        root.classList.add('vcp-fade--reveal');
        setTimeout(function () {
          root.classList.remove('vcp-fade', 'vcp-fade--reveal');
        }, FADE_REVEAL + 50);
      });
    };
    if (document.readyState === 'complete') reveal();
    else window.addEventListener('load', reveal);
  }

  /* bfcache restore must never resurface a stale overlay. */
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      try {
        sessionStorage.removeItem(TITLE_KEY);
        sessionStorage.removeItem(FADE_KEY);
      } catch (err) {}
      clearDip();
      root.classList.remove('vcp-fade', 'vcp-fade--reveal');
    }
  });

  /* ── Origin side ─────────────────────────────────────────────────── */

  var navigating = false;

  function playDip(url, title) {
    try { sessionStorage.setItem(TITLE_KEY, title); } catch (e) {}
    root.setAttribute('data-dip-title', title);
    root.classList.add('vcp-dip', 'vcp-dip--in');
    setTimeout(function () { window.location.href = url.href; }, DIP_NAV_DELAY);
  }

  function playFade(url) {
    try { sessionStorage.setItem(FADE_KEY, '1'); } catch (e) {}
    /* Add the veil transparent, then fade it up on the next frame. */
    root.classList.add('vcp-fade');
    requestAnimationFrame(function () { root.classList.add('vcp-fade--out'); });
    setTimeout(function () { window.location.href = url.href; }, FADE_NAV_DELAY);
  }

  document.addEventListener('click', function (e) {
    if (reduced.matches || e.defaultPrevented || e.button !== 0 ||
        e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    var link = e.target.closest ? e.target.closest('a[href]') : null;
    if (!link || link.hasAttribute('target') || link.hasAttribute('download')) return;

    var href = link.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#') return;

    var url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    /* Same-page fragment moves and same-page reloads don't transition. */
    if (norm(url) === norm(window.location)) return;

    if (navigating) return;
    e.preventDefault();
    navigating = true;

    var isNavTab = !!(link.closest && link.closest('.vcp-nav__links'));
    var firstVisit = seenPages().indexOf(norm(url)) === -1;
    /* Dip needs a name: nav tabs use their text; other links must opt in
       with data-dip-title. No title → cross-fade even on first visit. */
    var title = isNavTab
      ? (link.textContent || '').trim()
      : (link.getAttribute('data-dip-title') || '').trim();

    if (firstVisit && title) playDip(url, title);
    else playFade(url);
  });
})();
