/**
 * VCP Distro — "list once, sync everywhere" distribution card.
 *
 * A two-column marketing card: copy on the left (eyebrow, display title,
 * sub, live status row), a hub-and-spoke diagram on the right — channel
 * brand tiles wired into a central product node with a slow animated dash
 * flow. Brand marks keep their official colors on light plates (same
 * precedent as .vcp-logo-chip / the Socials page); everything else stays
 * in the silver system. Wires and pulse freeze under prefers-reduced-motion.
 *
 * Spec: { eyebrow, title (may contain <br>), sub, status_label, status_note,
 *         hub_logo, hub_alt, left: [iconKey], right: [iconKey],
 *         aria_label }
 * Icon keys: whatsapp | instagram | sheets | booking | expedia | "more:<text>"
 */
(function () {
  'use strict';

  var ICONS = {
    whatsapp:
      '<svg viewBox="0 0 256 258" aria-hidden="true">' +
      '<defs><linearGradient id="vcpWaBg" x1="50%" y1="100%" x2="50%" y2="0%">' +
      '<stop stop-color="#1FAF38" offset="0%"/><stop stop-color="#60D669" offset="100%"/></linearGradient>' +
      '<linearGradient id="vcpWaFg" x1="50%" y1="100%" x2="50%" y2="0%">' +
      '<stop stop-color="#F9F9F9" offset="0%"/><stop stop-color="#FFFFFF" offset="100%"/></linearGradient></defs>' +
      '<path fill="url(#vcpWaBg)" d="M5.463 127.456c-.006 21.677 5.658 42.843 16.428 61.499L4.433 252.697l65.232-17.104c17.971 9.795 38.207 14.965 58.8 14.97h.054c67.815 0 123.018-55.184 123.047-123.01.013-32.868-12.775-63.773-36.009-87.025C192.328 17.278 161.432 4.467 128.514 4.452c-67.823 0-123.022 55.18-123.05 123.004"/>' +
      '<path fill="url(#vcpWaFg)" d="M1.071 127.416c-.008 22.457 5.86 44.38 17.013 63.703L0 257.147l67.571-17.717c18.618 10.151 39.58 15.503 60.911 15.511h.054c70.248 0 127.434-57.168 127.464-127.423.012-34.048-13.236-66.065-37.3-90.15C194.633 13.286 162.633.014 128.536 0 58.275 0 1.099 57.159 1.071 127.416m40.24 60.376l-2.523-4.005c-10.606-16.864-16.204-36.352-16.196-56.363.023-58.394 47.547-105.902 105.986-105.902 28.298.012 54.895 11.043 74.899 31.06 20.003 20.018 31.01 46.628 31.003 74.93-.026 58.395-47.551 105.91-105.943 105.91h-.042c-19.013-.01-37.66-5.116-53.922-14.765l-3.87-2.295-40.098 10.513z"/>' +
      '<path fill="#FFF" d="M96.678 74.148c-2.386-5.304-4.897-5.41-7.166-5.503-1.858-.08-3.982-.074-6.104-.074-2.124 0-5.575.799-8.492 3.985-2.92 3.187-11.148 10.891-11.148 26.56 0 15.671 11.414 30.813 13.004 32.94 1.593 2.123 22.033 35.307 54.405 48.073 26.904 10.609 32.379 8.499 38.218 7.967 5.84-.53 18.844-7.702 21.497-15.139 2.655-7.436 2.655-13.81 1.859-15.142-.796-1.327-2.92-2.124-6.105-3.716-3.186-1.593-18.843-9.299-21.762-10.362-2.92-1.061-5.043-1.591-7.167 1.597-2.123 3.184-8.223 10.356-10.082 12.48-1.857 2.129-3.716 2.394-6.9.801-3.187-1.598-13.444-4.957-25.613-15.806-9.468-8.442-15.86-18.867-17.718-22.056-1.857-3.184-.198-4.91 1.398-6.497 1.431-1.427 3.186-3.719 4.779-5.578 1.589-1.86 2.119-3.187 3.181-5.311 1.063-2.126.531-3.986-.265-5.579-.796-1.593-6.986-17.343-9.818-23.641"/></svg>',
    instagram:
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<defs><radialGradient id="vcpIgg" cx="0.3" cy="1" r="1.15">' +
      '<stop offset="0" stop-color="#FEDA75"/><stop offset="0.25" stop-color="#FA7E1E"/>' +
      '<stop offset="0.5" stop-color="#D62976"/><stop offset="0.75" stop-color="#962FBF"/>' +
      '<stop offset="1" stop-color="#4F5BD5"/></radialGradient></defs>' +
      '<rect x="1" y="1" width="22" height="22" rx="6.2" fill="url(#vcpIgg)"/>' +
      '<rect x="6.4" y="6.4" width="11.2" height="11.2" rx="3.6" fill="none" stroke="#fff" stroke-width="1.6"/>' +
      '<circle cx="12" cy="12" r="3.1" fill="none" stroke="#fff" stroke-width="1.6"/>' +
      '<circle cx="16.4" cy="7.6" r="1.05" fill="#fff"/></svg>',
    sheets:
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path fill="#0F9D58" fill-rule="evenodd" d="M11.318 12.545H7.91v-1.909h3.41v1.91zM14.728 0v6h6l-6-6zm1.363 10.636h-3.41v1.91h3.41v-1.91zm0 3.273h-3.41v1.91h3.41v-1.91zM20.727 6.5v15.864c0 .904-.732 1.636-1.636 1.636H4.909a1.636 1.636 0 0 1-1.636-1.636V1.636C3.273.732 4.005 0 4.909 0h9.318v6.5h6.5zm-3.273 2.773H6.545v7.909h10.91v-7.91zm-6.136 4.636H7.91v1.91h3.41v-1.91z"/></svg>',
    booking:
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<clipPath id="vcpBkclip"><rect width="24" height="24" rx="5"/></clipPath>' +
      '<path clip-path="url(#vcpBkclip)" fill="#003580" d="M24 0H0v24h24ZM8.575 6.563h2.658c2.108 0 3.473 1.15 3.473 2.898 0 1.15-.575 1.82-.91 2.108l-.287.263.335.192c.815.479 1.318 1.389 1.318 2.395 0 1.988-1.51 3.257-3.857 3.257H7.449V7.713c0-.623.503-1.126 1.126-1.15zm1.7 1.868c-.479.024-.694.264-.694.79v1.893h1.676c.958 0 1.294-.743 1.294-1.365 0-.815-.503-1.318-1.318-1.318zm-.096 4.36c-.407.071-.598.31-.598.79v2.251h1.868c.934 0 1.509-.55 1.509-1.533 0-.934-.599-1.509-1.51-1.509zm7.737 2.394c.743 0 1.341.599 1.341 1.342a1.34 1.34 0 0 1-1.341 1.341 1.355 1.355 0 0 1-1.341-1.341c0-.743.598-1.342 1.34-1.342z"/></svg>',
    expedia:
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<rect x="0" y="0" width="24" height="24" rx="4.93" fill="#FEC42B"/>' +
      '<path fill="#00355F" d="M7.336 19.341c0 .19-.148.337-.337.337h-2.33a.333.333 0 0 1-.337-.337v-2.33c0-.189.148-.336.337-.336H7c.19 0 .337.147.337.337zM19.457 17.855l-2.308 2.298c-.169.168-.422.053-.422-.2V9.57l-6.44 6.44a.533.533 0 0 1-.421.17H8.169a.32.32 0 0 1-.338-.338v-1.697c0-.2.053-.316.169-.422l6.44-6.44H4.058c-.253 0-.369-.253-.2-.421l2.297-2.309c.137-.137.285-.232.517-.232H18.15c.854 0 1.539.686 1.539 1.54v11.478c-.01.231-.095.368-.232.516z"/></svg>'
  };

  // Tile/node centers as % of the diagram box — must match the wire endpoints.
  var LEFT_POS = ['11.2% 15%', '11.2% 50%', '11.2% 85%'];
  var RIGHT_POS = ['88.8% 15%', '88.8% 50%', '88.8% 85%'];
  var WIRES = [
    'M250 176 L56 52.8', 'M250 176 L56 176', 'M250 176 L56 299.2',
    'M250 176 L444 52.8', 'M250 176 L444 176', 'M250 176 L444 299.2'
  ];

  function tile(key, pos) {
    var xy = pos.split(' ');
    var inner = key.indexOf('more:') === 0
      ? '<span class="vcp-distro__more">' + key.slice(5) + '</span>'
      : (ICONS[key] || '');
    return '<div class="vcp-distro__tile" style="left:' + xy[0] + ';top:' + xy[1] + ';" aria-hidden="true">' + inner + '</div>';
  }

  function render(container, spec) {
    var card = document.createElement('div');
    card.className = 'vcp-distro';

    var wires = WIRES.map(function (d) {
      return '<path class="vcp-distro__wire" d="' + d + '"/>';
    }).join('');

    card.innerHTML =
      '<div class="vcp-distro__copy">' +
        '<div class="label-caps label-caps--wide">' + spec.eyebrow + '</div>' +
        '<h3 class="vcp-distro__title">' + spec.title + '</h3>' +
        '<p class="vcp-distro__sub">' + spec.sub + '</p>' +
        '<div class="vcp-distro__rule"></div>' +
        '<div class="vcp-distro__status">' +
          '<span class="vcp-distro__live"><span class="vcp-distro__pulse"></span>' + spec.status_label + '</span>' +
          '<span class="vcp-distro__note">' + spec.status_note + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="vcp-distro__diagram" role="img" aria-label="' + spec.aria_label + '">' +
        '<svg class="vcp-distro__wires" viewBox="0 0 500 352" preserveAspectRatio="none" aria-hidden="true">' + wires + '</svg>' +
        spec.left.map(function (key, i) { return tile(key, LEFT_POS[i]); }).join('') +
        spec.right.map(function (key, i) { return tile(key, RIGHT_POS[i]); }).join('') +
        '<div class="vcp-distro__node" aria-hidden="true"><img src="' + spec.hub_logo + '" alt=""></div>' +
      '</div>';

    container.appendChild(card);
  }

  window.VCPDistro = { render: render };
})();
