/**
 * VCP Rate Calc — illustrative dynamic-pricing widget.
 *
 * A small card that demonstrates demand-driven pricing: drag occupancy,
 * toggle weekend, and the suggested nightly rate updates live in USD and
 * bolívares at the configured BCV rate. Deliberately simple math, labeled
 * illustrative — it demonstrates the behavior, not the production engine.
 *
 * Spec: { base_usd, bcv, disclaimer }
 * Illustrative model: rate = base × (0.75 + 0.9 × occupancy) × (weekend ? 1.15 : 1)
 */
(function () {
  'use strict';

  function fmtBs(value) {
    return 'Bs ' + String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function render(container, spec) {
    var card = document.createElement('div');
    card.className = 'vcp-calc';
    card.innerHTML =
      '<div class="label-caps label-caps--wide vcp-calc__label">Illustrative rate engine</div>' +
      '<div class="vcp-calc__grid">' +
        '<div class="vcp-calc__controls">' +
          '<label class="vcp-calc__control">' +
            '<span>Occupancy <strong data-occ-label>60%</strong></span>' +
            '<input type="range" min="0" max="100" value="60" data-occ aria-label="Occupancy percentage">' +
          '</label>' +
          '<label class="vcp-calc__control vcp-calc__control--row">' +
            '<input type="checkbox" data-weekend aria-label="Weekend night">' +
            '<span>Weekend night</span>' +
          '</label>' +
        '</div>' +
        '<div class="vcp-calc__result">' +
          '<div class="vcp-calc__caption">Suggested nightly rate</div>' +
          '<div class="vcp-calc__usd" data-usd>$65</div>' +
          '<div class="vcp-calc__bs" data-bs>Bs 45.514</div>' +
        '</div>' +
      '</div>' +
      '<p class="vcp-calc__disclaimer">' + spec.disclaimer + '</p>';
    container.appendChild(card);

    var occ = card.querySelector('[data-occ]');
    var weekend = card.querySelector('[data-weekend]');
    var occLabel = card.querySelector('[data-occ-label]');
    var usdOut = card.querySelector('[data-usd]');
    var bsOut = card.querySelector('[data-bs]');

    function update() {
      var occupancy = Number(occ.value) / 100;
      var rate = spec.base_usd * (0.75 + 0.9 * occupancy) * (weekend.checked ? 1.15 : 1);
      var usd = Math.round(rate);
      occLabel.textContent = occ.value + '%';
      usdOut.textContent = '$' + usd;
      bsOut.textContent = fmtBs(usd * spec.bcv);
    }

    occ.addEventListener('input', update);
    weekend.addEventListener('change', update);
    update();
  }

  window.VCPRateCalc = { render: render };
})();
