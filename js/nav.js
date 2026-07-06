/* Mobile nav (issue #85): ≤900px the inline links collapse into a menu
   box behind .vcp-nav__toggle, and the glass pill slides out of sight
   while reading down (back on scroll-up). Desktop is untouched. */
(function () {
  var nav = document.querySelector('.vcp-nav');
  if (!nav) return;

  var toggle = nav.querySelector('.vcp-nav__toggle');
  var mobile = window.matchMedia('(max-width: 900px)');

  function isOpen() { return nav.classList.contains('is-open'); }

  function setOpen(open) {
    nav.classList.toggle('is-open', open);
    if (toggle) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }
  }

  if (toggle) {
    toggle.addEventListener('click', function () { setOpen(!isOpen()); });

    document.addEventListener('click', function (e) {
      if (isOpen() && !nav.contains(e.target)) setOpen(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) {
        setOpen(false);
        toggle.focus();
      }
    });

    nav.querySelectorAll('.vcp-nav__links a').forEach(function (a) {
      a.addEventListener('click', function () { setOpen(false); });
    });
  }

  /* Scroll-away: hide after a real downward move, reveal on any upward
     move. The 6px delta filter keeps rubber-band scrolling from
     flickering the pill. */
  var lastY = window.scrollY;

  window.addEventListener('scroll', function () {
    var y = window.scrollY;

    if (!mobile.matches) {
      nav.classList.remove('vcp-nav--away');
      lastY = y;
      return;
    }

    var delta = y - lastY;
    if (Math.abs(delta) < 6) return;

    if (delta > 0 && y > 72) {
      if (isOpen()) setOpen(false);
      nav.classList.add('vcp-nav--away');
    } else if (delta < 0) {
      nav.classList.remove('vcp-nav--away');
    }
    lastY = y;
  }, { passive: true });

  /* Leaving the mobile breakpoint resets both states */
  mobile.addEventListener('change', function (e) {
    if (!e.matches) {
      setOpen(false);
      nav.classList.remove('vcp-nav--away');
    }
  });
})();
