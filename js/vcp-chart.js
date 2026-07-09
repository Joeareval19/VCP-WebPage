/**
 * VCP Chart — minimal dependency-free line-chart renderer (inline SVG).
 *
 * Renders a spec as vertically aligned single-axis panels that share the same
 * x scale (never dual y-axes on one plot). A panel can carry multiple series
 * as long as they share one unit; each series gets a distinct monochrome line
 * style (identity never rides on color alone). A shared key sits to the
 * right; hovering shows a crosshair + tooltip across all panels; a <details>
 * data table provides the non-visual fallback.
 *
 * Spec shape (all trusted data from our own data files):
 * {
 *   title: string,
 *   note: string,                       // assumptions, shown under the title
 *   xTicks: [{ at: <index>, label }],   // e.g. yearly marks on monthly data
 *   xName: string,                      // x unit name for tooltip/table, e.g. "Month"
 *   panels: [{
 *     label,                            // panel title (its shared unit)
 *     yTicks: [numbers], format: 'usd'|'count', height: <viewBox px>,
 *     series: [{ label, points: [numbers] }]
 *   }]
 * }
 */
(function () {
  'use strict';

  var VB_W = 640;      // viewBox width shared by all panels
  var PAD_L = 46;      // room for y tick labels
  var PAD_R = 28;      // wide enough that a centered label on the last x tick doesn't clip
  var PAD_T = 22;      // room for the panel's direct label
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var STYLES = ['a', 'b', 'c', 'd'];  // line styles assigned in fixed series order

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

  // Flat list of {panel, series, styleIndex} in spec order — drives line
  // styles, the key, the tooltip, and the data table identically.
  function flatSeries(spec) {
    var flat = [];
    spec.panels.forEach(function (panel) {
      panel.series.forEach(function (series) {
        flat.push({ panel: panel, series: series, style: STYLES[flat.length % STYLES.length] });
      });
    });
    return flat;
  }

  function buildPanel(panel, spec, isLast, flat) {
    var height = panel.height || 190;
    var padB = isLast ? 24 : 8;
    var plotW = VB_W - PAD_L - PAD_R;
    var plotH = height - PAD_T - padB;
    var n = panel.series[0].points.length;
    var dataMax = Math.max.apply(null, panel.series.map(function (s) {
      return Math.max.apply(null, s.points);
    }));
    var yMax = Math.max(panel.yTicks[panel.yTicks.length - 1], dataMax);

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

    // Series lines, styled by their fixed position in the flat order
    panel.series.forEach(function (series) {
      var entry = flat.filter(function (f) { return f.series === series; })[0];
      var d = series.points.map(function (v, i) {
        return (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
      }).join(' ');
      svg.appendChild(el('path', { d: d, class: 'vcp-chart__line vcp-chart__line--' + entry.style }));
    });

    // Panel direct label (the shared unit; per-line identity lives in the key)
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

  function buildLegend(flat) {
    var legend = document.createElement('div');
    legend.className = 'vcp-chart__legend';
    flat.forEach(function (entry) {
      var item = document.createElement('div');
      item.className = 'vcp-chart__legend-item';
      var swatch = document.createElement('span');
      swatch.className = 'vcp-chart__swatch vcp-chart__swatch--' + entry.style;
      var text = document.createElement('span');
      text.textContent = entry.series.label;
      item.appendChild(swatch);
      item.appendChild(text);
      legend.appendChild(item);
    });
    return legend;
  }

  function buildTable(spec, flat) {
    var details = document.createElement('details');
    details.className = 'vcp-chart__table';
    var rows = flat[0].series.points.map(function (_, i) {
      return '<tr><td>' + (i + 1) + '</td>' + flat.map(function (entry) {
        return '<td>' + fmtLong(entry.series.points[i], entry.panel.format) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    details.innerHTML =
      '<summary>Data table</summary>' +
      '<div class="vcp-prose"><table>' +
        '<thead><tr><th>' + spec.xName + '</th>' + flat.map(function (entry) {
          return '<th>' + entry.series.label + '</th>';
        }).join('') + '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table></div>';
    return details;
  }

  function render(container, spec) {
    var flat = flatSeries(spec);

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
      var b = buildPanel(panel, spec, i === spec.panels.length - 1, flat);
      panelsWrap.appendChild(b.svg);
      return b;
    });

    var tip = document.createElement('div');
    tip.className = 'vcp-chart__tip';
    panelsWrap.appendChild(tip);

    layout.appendChild(panelsWrap);
    layout.appendChild(buildLegend(flat));
    figure.appendChild(layout);
    figure.appendChild(buildTable(spec, flat));
    container.appendChild(figure);

    // Hover: nearest-x crosshair across every panel + one tooltip.
    var n = flat[0].series.points.length;
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
        flat.map(function (entry) {
          return '<span>' + entry.series.label + ': ' + fmtLong(entry.series.points[idx], entry.panel.format) + '</span>';
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
