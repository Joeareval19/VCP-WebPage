/* Title-dip page transition (issue #57).
   Origin side: intercepts nav-tab clicks, dips to black with the
   destination's title, then navigates behind the overlay.
   Destination side: the inline pre-paint snippet in each page's <head>
   already showed the overlay (via sessionStorage handshake); this script
   holds it for a beat after load, then runs the slow fade-away.
   Overlay visuals live in css/components.css (html.vcp-dip pseudo-elements). */
(function () {
  var KEY = 'vcp-dip-title';
  /* Handoff: navigate just after --dur-dip-in (320ms) completes; the
     --hold breathe animation's -340ms delay in components.css matches. */
  var NAV_DELAY = 340;
  var MIN_HOLD = 700;  /* ms the title stays before the fade-away starts */

  var root = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  function clear() {
    root.classList.remove('vcp-dip', 'vcp-dip--in', 'vcp-dip--hold', 'vcp-dip--out');
    root.removeAttribute('data-dip-title');
  }

  /* Destination side — pre-paint snippet set --hold before first paint. */
  if (root.classList.contains('vcp-dip--hold')) {
    try { sessionStorage.removeItem(KEY); } catch (e) {}
    var arrived = Date.now();
    var fadeAway = function () {
      setTimeout(function () {
        root.classList.remove('vcp-dip--hold');
        root.classList.add('vcp-dip--out');
        setTimeout(clear, 1250); /* --dur-dip-out + margin */
      }, Math.max(0, MIN_HOLD - (Date.now() - arrived)));
    };
    if (document.readyState === 'complete') fadeAway();
    else window.addEventListener('load', fadeAway);
  }

  /* bfcache restore must never resurface a stale overlay. */
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      try { sessionStorage.removeItem(KEY); } catch (err) {}
      clear();
    }
  });

  /* Origin side — nav tabs only (.vcp-nav__links), plain left-clicks on
     same-origin page links. Anchors, external links, modified clicks, and
     the current page all navigate natively. */
  document.addEventListener('click', function (e) {
    if (reduced.matches || e.defaultPrevented || e.button !== 0 ||
        e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var link = e.target.closest ? e.target.closest('.vcp-nav__links a') : null;
    if (!link || link.hasAttribute('aria-current') || link.hasAttribute('target')) return;
    var href = link.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#') return;
    var url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || url.hash) return;
    if (url.pathname === window.location.pathname) return;

    e.preventDefault();
    var title = (link.textContent || '').trim();
    try { sessionStorage.setItem(KEY, title); } catch (err) {}
    root.setAttribute('data-dip-title', title);
    root.classList.add('vcp-dip', 'vcp-dip--in');
    setTimeout(function () { window.location.href = url.href; }, NAV_DELAY);
  });
})();
