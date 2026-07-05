/* Penrose loader — "Quicksilver" (issue #71).
   Loading transition for internal navigation OUTSIDE the top nav
   (the nav tabs + brand are title-dip territory, js/page-dip.js).

   Sequence (mirrors the dip's handshake):
   - Origin: qualifying click is intercepted; veil fades in and the
     triangle populates (pop + sheen sweep) on the CURRENT page, then
     navigation fires behind it (~NAV_DELAY later).
   - Destination: the inline pre-paint snippet in each page's <head>
     saw the sessionStorage flag and stamped html.vcp-loading before
     first paint — veil up, page content blurred (components.css).
     This script re-mounts the triangle, holds a short beat past
     load, then the veil+triangle fade while the page blurs into
     focus (html.vcp-loading--reveal).
   Under prefers-reduced-motion navigation is native and immediate.
   Styles: .vcp-loader + html.vcp-loading in css/components.css. */
(function () {
  var KEY = 'vcp-loader';
  var NAV_DELAY = 750;  /* ms the triangle populates before leaving */
  var DEST_MIN = 350;   /* ms minimum hold on the destination */
  var REVEAL = 700;     /* ms for fade-out + blur-into-focus cleanup */

  var root = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var overlay = null;
  var navigating = false;

  /* One Penrose arm; the other two are 120° rotations. Derived so every
     vertex sits exactly on the outer / mid / hole edge lines (R=100,
     bar thickness 18, centroid at 0,0). */
  var ARM = 'M -65.82 50 L 86.6 50 L 76.21 32 L 55.43 32 L 10.39 -46 ' +
            'L 0 -28 L 34.64 32 L -55.43 32 Z';

  function build() {
    var el = document.createElement('div');
    el.className = 'vcp-loader';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-label', 'Loading');
    var arms = '<path d="' + ARM + '"/>' +
               '<path transform="rotate(120)" d="' + ARM + '"/>' +
               '<path transform="rotate(240)" d="' + ARM + '"/>';
    el.innerHTML =
      '<svg viewBox="-100 -125 200 200" aria-hidden="true">' +
        '<defs>' +
          '<linearGradient id="vcp-loader-sheen" x1="-110" y1="0" x2="110" y2="0"' +
          ' gradientUnits="userSpaceOnUse">' +
            '<stop offset="0" style="stop-color: var(--metal-dark)"/>' +
            '<stop offset="0.35" style="stop-color: var(--metal-mid)"/>' +
            '<stop offset="0.52" style="stop-color: var(--silver-bright)"/>' +
            '<stop offset="0.62" style="stop-color: var(--silver)"/>' +
            '<stop offset="0.8" style="stop-color: var(--metal-dark)"/>' +
            '<stop offset="1" style="stop-color: var(--metal-dark)"/>' +
            '<animateTransform attributeName="gradientTransform" type="rotate"' +
            ' from="0 0 -25" to="360 0 -25" dur="2.6s" repeatCount="indefinite"/>' +
          '</linearGradient>' +
        '</defs>' +
        '<g fill="url(#vcp-loader-sheen)" stroke="var(--bg)" stroke-width="2">' +
          arms +
        '</g>' +
      '</svg>';
    return el;
  }

  function mount() {
    if (!overlay) {
      overlay = build();
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function clear() {
    root.classList.remove('vcp-loading', 'vcp-loading--reveal');
    navigating = false;
    if (overlay) {
      var el = overlay;
      overlay = null;
      if (el.parentNode) el.parentNode.removeChild(el);
    }
    try { sessionStorage.removeItem(KEY); } catch (e) {}
  }

  /* Destination side — pre-paint snippet stamped html.vcp-loading:
     veil up, content blurred, before first paint. Re-mount the
     triangle, hold briefly past load, then blur into the page. */
  if (root.classList.contains('vcp-loading')) {
    try { sessionStorage.removeItem(KEY); } catch (e) {}
    var arrived = Date.now();
    var el = mount();
    /* Veil is carried by html.vcp-loading (the element's own scrim is
       suppressed while that class is on) — appear at full opacity. */
    el.classList.add('is-instant', 'is-on');
    requestAnimationFrame(function () { el.classList.remove('is-instant'); });
    var reveal = function () {
      setTimeout(function () {
        /* Swap: veil moves from html::before to the element (same
           scrim, same frame), blur starts transitioning to focus,
           overlay fades away. */
        root.classList.remove('vcp-loading');
        root.classList.add('vcp-loading--reveal');
        el.classList.remove('is-on');
        setTimeout(clear, REVEAL);
      }, Math.max(0, DEST_MIN - (Date.now() - arrived)));
    };
    if (document.readyState === 'complete') reveal();
    else window.addEventListener('load', reveal);
  }

  /* bfcache restore must never resurface a stale overlay or blur. */
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) clear();
  });

  /* Origin side. */
  document.addEventListener('click', function (e) {
    if (reduced.matches || e.defaultPrevented || e.button !== 0 ||
        e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var link = e.target.closest ? e.target.closest('a[href]') : null;
    if (!link || link.hasAttribute('target') || link.hasAttribute('download')) return;
    if (link.closest('.vcp-nav')) return; /* top nav → title dip, not this */
    var href = link.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#') return;
    var url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    /* Same-page fragment moves don't load anything. */
    if (url.pathname === window.location.pathname && url.hash) return;

    e.preventDefault();
    if (navigating) return;
    navigating = true;
    try { sessionStorage.setItem(KEY, '1'); } catch (err) {}
    var el = mount();
    el.classList.add('is-entering');
    requestAnimationFrame(function () { el.classList.add('is-on'); });
    setTimeout(function () { window.location.href = url.href; }, NAV_DELAY);
  });
})();
