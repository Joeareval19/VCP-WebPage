/* Penrose loader — "Quicksilver" (issue #71).
   Shows a loading placeholder when an internal link OUTSIDE the top nav
   is clicked: a Penrose tri-bar whose silver sheen circulates while the
   next page loads. The top nav (tabs + brand) is title-dip territory
   (js/page-dip.js) and is excluded here.
   Navigation is never intercepted — the overlay is pure decoration on
   top of the native page load. Overlay styles: .vcp-loader in
   css/components.css. */
(function () {
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var overlay = null;
  var watchdog = null;

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
    /* SMIL ignores prefers-reduced-motion, so the rotation is only
       injected when motion is allowed; otherwise the sheen sits still. */
    var spin = reduced.matches ? '' :
      '<animateTransform attributeName="gradientTransform" type="rotate"' +
      ' from="0 0 -25" to="360 0 -25" dur="2.6s" repeatCount="indefinite"/>';
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
            spin +
          '</linearGradient>' +
        '</defs>' +
        '<g fill="url(#vcp-loader-sheen)" stroke="var(--bg)" stroke-width="2">' +
          arms +
        '</g>' +
      '</svg>';
    return el;
  }

  function show() {
    if (!overlay) {
      overlay = build();
      document.body.appendChild(overlay);
    }
    requestAnimationFrame(function () { overlay.classList.add('is-on'); });
    /* If navigation never happens (another handler canceled it after us,
       download prompt, etc.) the veil must not linger. */
    clearTimeout(watchdog);
    watchdog = setTimeout(hide, 8000);
  }

  function hide() {
    clearTimeout(watchdog);
    if (overlay) overlay.classList.remove('is-on');
  }

  /* bfcache restore must never resurface a stale overlay. */
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) hide();
  });

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 ||
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
    show();
  });
})();
