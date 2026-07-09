/**
 * VCP Carousel — dependency-free 3D screenshot carousel.
 *
 * Renders article blocks ({heading, html, image}) as a perspective stage:
 * the active slide faces the reader, its neighbors recede left/right with a
 * slight rotateY/scale, everything else hides behind. Each screenshot sits
 * in a monochrome browser-chrome frame (traffic-light dots + URL pill). The
 * active block's heading, prose, and caption swap in below the stage.
 *
 * Navigation: click the center slide (or Next) to advance, side slides and
 * dots jump, arrow keys work while the widget has focus. Honors
 * prefers-reduced-motion via CSS (transitions collapse to a plain swap).
 */
(function () {
  'use strict';

  function render(container, opts) {
    var blocks = opts.blocks;
    var n = blocks.length;
    var active = 0;

    var root = document.createElement('section');
    root.className = 'vcp-carousel';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-roledescription', 'carousel');
    root.setAttribute('aria-label', opts.label || 'Product walkthrough');
    root.setAttribute('tabindex', '0');

    var stage = document.createElement('div');
    stage.className = 'vcp-carousel__stage';

    var slides = blocks.map(function (block, i) {
      var slide = document.createElement('div');
      slide.className = 'vcp-carousel__slide';
      slide.setAttribute('role', 'group');
      slide.setAttribute('aria-roledescription', 'slide');
      slide.setAttribute('aria-label', (i + 1) + ' of ' + n + ': ' + block.heading);

      var frame = document.createElement('figure');
      frame.className = 'vcp-browser';

      var bar = document.createElement('div');
      bar.className = 'vcp-browser__bar';
      bar.innerHTML =
        '<span class="vcp-browser__dots" aria-hidden="true"><i></i><i></i><i></i></span>' +
        '<span class="vcp-browser__url">' + (opts.chromeUrl || '') + '</span>';
      frame.appendChild(bar);

      var img = document.createElement('img');
      img.src = block.image.src;
      img.alt = block.image.alt;
      img.width = block.image.width;
      img.height = block.image.height;
      if (i !== 0) img.loading = 'lazy';
      frame.appendChild(img);

      slide.appendChild(frame);
      slide.addEventListener('click', function () {
        // Center click reads as "next"; a side slide brings itself forward.
        goTo(i === active ? active + 1 : i);
      });
      stage.appendChild(slide);
      return slide;
    });

    var controls = document.createElement('div');
    controls.className = 'vcp-carousel__controls';

    var prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'vcp-carousel__arrow';
    prevBtn.setAttribute('aria-label', 'Previous screen');
    prevBtn.innerHTML = '&larr;';
    prevBtn.addEventListener('click', function () { goTo(active - 1); });

    var nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'vcp-carousel__arrow';
    nextBtn.setAttribute('aria-label', 'Next screen');
    nextBtn.innerHTML = '&rarr;';
    nextBtn.addEventListener('click', function () { goTo(active + 1); });

    var dotsWrap = document.createElement('div');
    dotsWrap.className = 'vcp-carousel__dots';
    var dots = blocks.map(function (block, i) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'vcp-carousel__dot';
      dot.setAttribute('aria-label', 'Go to screen ' + (i + 1) + ': ' + block.heading);
      dot.addEventListener('click', function () { goTo(i); });
      dotsWrap.appendChild(dot);
      return dot;
    });

    controls.appendChild(prevBtn);
    controls.appendChild(dotsWrap);
    controls.appendChild(nextBtn);

    var body = document.createElement('div');
    body.className = 'vcp-carousel__body';
    body.setAttribute('aria-live', 'polite');

    root.appendChild(stage);
    root.appendChild(controls);
    root.appendChild(body);
    container.appendChild(root);

    root.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(active + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(active - 1); }
    });

    function goTo(index) {
      active = (index + n) % n;
      slides.forEach(function (slide, i) {
        var rel = (i - active + n) % n;
        var pos = rel === 0 ? 'active' : rel === 1 ? 'right' : rel === n - 1 ? 'left' : 'hidden';
        slide.className = 'vcp-carousel__slide vcp-carousel__slide--' + pos;
        slide.setAttribute('aria-hidden', pos === 'active' ? 'false' : 'true');
      });
      dots.forEach(function (dot, i) {
        dot.setAttribute('aria-current', i === active ? 'true' : 'false');
      });
      var block = blocks[active];
      body.innerHTML =
        '<h3>' + block.heading + '</h3>' +
        '<div class="vcp-prose">' + block.html + '</div>' +
        (block.image.caption ? '<p class="vcp-carousel__caption">' + block.image.caption + '</p>' : '');
    }

    goTo(0);
  }

  window.VCPCarousel = { render: render };
})();
