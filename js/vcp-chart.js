/**
 * VCP Chart — minimal dependency-free line-chart renderer (inline SVG).
 *
 * Renders a spec of N series as vertically aligned single-axis panels that
 * share the same x scale (never dual y-axes on one plot). Each panel gets its
 * own y scale and direct label; a shared key sits to the right; hovering
 * shows a crosshair + tooltip across all panels; a <details> data table
 * provides the non-visual fallback.
 *
 * Spec shape (all trusted data from our own data files):
 * {
 *   title: string,
 *   note: string,                       // assumptions, shown under the title
 *   xTicks: [{ at: <index>, label }],   // e.g. yearly marks on monthly data
 *   xName: string,                      // x unit name for tooltip/table, e.g. "Month"
 *   panels: [{
 *     label, points: [numbers],
 *     yTicks: [numbers], format: 'usd'|'count', height: <viewBox px>
 *   }]
 * }
 */
(function () {
  'use strict';

  var VB_W = 640;      // viewBox width shared by all panels
  var PAD_L = 46;      // room for y tick labels
  var PAD_R = 28;  // wide enough that a centered label on the last x tick doesn't clip
  var PAD_T = 22;      // room for the panel's direct label
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function fmt(value, format) {
    if (format === 'usd') {
      return value >= 1000 ? '$' + Math.round(value / 1000) + 'k' : '$' + value;
    }
    return String(value);
  }

  function fmtLong(value, format) {
    var s = String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return format === 'usd' ? '$' + s : s;
  }

  function el(name, attrs) {
    var node = document.createElementNS(SVG_NS, name);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }

  function buildPanel(panel, spec, isLast, seriesIndex) {
    var height = panel.height || 190;
    var padB = isLast ? 24 : 8;
    var plotW = VB_W - PAD_L - PAD_R;
    var plotH = height - PAD_T - padB;
    var n = panel.points.length;
    var yMax = Math.max(panel.yTicks[panel.yTicks.length - 1], Math.max.apply(null, panel.points));

    var svg = el('svg', {
      viewBox: '0 0 ' + VB_W + ' ' + height,
      class: 'vcp-chart__panel',
      'aria-hidden': 'true',
      focusable: 'false'
    });

    function x(i) { return PAD_L + (i / (n - 1)) * plotW; }
    function y(v) { return PAD_T + plotH - (v / yMax) * plotH; }

    // Horizontal gridlines + y tick labels
    panel.yTicks.forEach(function (tick) {
      svg.appendChild(el('line', {
        x1: PAD_L, x2: VB_W - PAD_R, y1: y(tick), y2: y(tick), class: 'vcp-chart__grid'
      }));
      var label = el('text', { x: PAD_L - 6, y: y(tick) + 3, 'text-anchor': 'end', class: 'vcp-chart__tick' });
      label.textContent = fmt(tick, panel.format);
      svg.appendChild(label);
    });

    // X tick marks (labels only on the last panel)
    spec.xTicks.forEach(function (tick) {
      svg.appendChild(el('line', {
        x1: x(tick.at), x2: x(tick.at), y1: PAD_T, y2: PAD_T + plotH, class: 'vcp-chart__grid'
      }));
      if (isLast) {
        var label = el('text', { x: x(tick.at), y: height - 8, 'text-anchor': 'middle', class: 'vcp-chart__tick' });
        label.textContent = tick.label;
        svg.appendChild(label);
      }
    });

    // The series line
    var d = panel.points.map(function (v, i) {
      return (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
    }).join(' ');
    svg.appendChild(el('path', { d: d, class: 'vcp-chart__line vcp-chart__line--' + (seriesIndex === 0 ? 'a' : 'b') }));

    // Direct label (identity never rides on color alone)
    var direct = el('text', { x: PAD_L, y: 13, class: 'vcp-chart__label' });
    direct.textContent = panel.label;
    svg.appendChild(direct);

    // Crosshair (moved on hover)
    var cross = el('line', {
      x1: -10, x2: -10, y1: PAD_T, y2: PAD_T + plotH, class: 'vcp-chart__cross'
    });
    svg.appendChild(cross);

    return { svg: svg, cross: cross, x: x };
  }

  function buildLegend(spec) {
    var legend = document.createElement('div');
    legend.className = 'vcp-chart__legend';
    spec.panels.forEach(function (panel, i) {
      var item = document.createElement('div');
      item.className = 'vcp-chart__legend-item';
      var swatch = document.createElement('span');
      swatch.className = 'vcp-chart__swatch vcp-chart__swatch--' + (i === 0 ? 'a' : 'b');
      var text = document.createElement('span');
      text.textContent = panel.label;
      item.appendChild(swatch);
      item.appendChild(text);
      legend.appendChild(item);
    });
    return legend;
  }

  function buildTable(spec) {
    var details = document.createElement('details');
    details.className = 'vcp-chart__table';
    var rows = spec.panels[0].points.map(function (_, i) {
      return '<tr><td>' + (i + 1) + '</td>' + spec.panels.map(function (panel) {
        return '<td>' + fmtLong(panel.points[i], panel.format) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    details.innerHTML =
      '<summary>Data table</summary>' +
      '<div class="vcp-prose"><table>' +
        '<thead><tr><th>' + spec.xName + '</th>' + spec.panels.map(function (panel) {
          return '<th>' + panel.label + '</th>';
        }).join('') + '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table></div>';
    return details;
  }

  function render(container, spec) {
    var figure = document.createElement('figure');
    figure.className = 'vcp-chart';
    figure.setAttribute('role', 'group');
    figure.setAttribute('aria-label', spec.title);

    var caption = document.createElement('figcaption');
    caption.className = 'vcp-chart__title';
    caption.textContent = spec.title;
    figure.appendChild(caption);

    if (spec.note) {
      var note = document.createElement('p');
      note.className = 'vcp-chart__note';
      note.textContent = spec.note;
      figure.appendChild(note);
    }

    var layout = document.createElement('div');
    layout.className = 'vcp-chart__layout';
    var panelsWrap = document.createElement('div');
    panelsWrap.className = 'vcp-chart__panels';

    var built = spec.panels.map(function (panel, i) {
      var b = buildPanel(panel, spec, i === spec.panels.length - 1, i);
      panelsWrap.appendChild(b.svg);
      return b;
    });

    var tip = document.createElement('div');
    tip.className = 'vcp-chart__tip';
    panelsWrap.appendChild(tip);

    layout.appendChild(panelsWrap);
    layout.appendChild(buildLegend(spec));
    figure.appendChild(layout);
    figure.appendChild(buildTable(spec));
    container.appendChild(figure);

    // Hover: nearest-month crosshair across every panel + one tooltip.
    var n = spec.panels[0].points.length;
    var plotW = VB_W - PAD_L - PAD_R;

    panelsWrap.addEventListener('pointermove', function (e) {
      var rect = panelsWrap.getBoundingClientRect();
      var scale = rect.width / VB_W;
      var vbX = (e.clientX - rect.left) / scale;
      var idx = Math.round(((vbX - PAD_L) / plotW) * (n - 1));
      idx = Math.max(0, Math.min(n - 1, idx));
      var snappedX = built[0].x(idx);

      built.forEach(function (b) {
        b.cross.setAttribute('x1', snappedX);
        b.cross.setAttribute('x2', snappedX);
        b.cross.style.opacity = '1';
      });

      tip.innerHTML = '<strong>' + spec.xName + ' ' + (idx + 1) + '</strong>' +
        spec.panels.map(function (panel) {
          return '<span>' + panel.label + ': ' + fmtLong(panel.points[idx], panel.format) + '</span>';
        }).join('');
      tip.style.display = 'flex';
      var tipX = snappedX * scale;
      tip.style.left = Math.min(Math.max(tipX + 12, 0), rect.width - 190) + 'px';
      tip.style.top = (e.clientY - rect.top + 16) + 'px';
    });

    panelsWrap.addEventListener('pointerleave', function () {
      tip.style.display = 'none';
      built.forEach(function (b) { b.cross.style.opacity = '0'; });
    });
  }

  window.VCPChart = { render: render };
})();
