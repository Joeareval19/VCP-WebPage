/**
 * VCP Projects — detail page renderer.
 *
 * Single template shared by every project: reads ?slug= from the URL,
 * looks up the matching entry in data/projects.json (via js/projects-data.js),
 * and renders the sections (header, overview, article, channels & pricing,
 * any project-specific extra_sections, timeline, moat, business model,
 * specifics, related). Every section after the header is optional —
 * omitted entirely, heading and all, when the underlying data is null/empty —
 * and section numbers are assigned to the sections that actually render, so
 * a minimal entry never shows gaps in the numbering.
 */
(function () {
  'use strict';

  var root = document.getElementById('detail-root');
  var escapeHtml = window.VCPProjects.escapeHtml;

  function getSlugFromUrl() {
    var params = new URLSearchParams(window.location.search);
    return params.get('slug');
  }

  function isBlank(value) {
    if (value == null) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
  }

  function sectionHeading(num, title) {
    return (
      '<div class="vcp-section-heading">' +
        '<span class="vcp-section-heading__num">' + num + '</span>' +
        '<h2>' + escapeHtml(title) + '</h2>' +
      '</div>'
    );
  }

  function renderHeader(project) {
    return (
      '<header class="vcp-detail-header">' +
        '<p class="detail-back"><a class="vcp-link" href="projects.html">&larr; Portfolio</a></p>' +
        (project.logo
          ? '<span class="vcp-logo-chip vcp-logo-chip--lg" style="margin-top: var(--space-4);"><img src="' + escapeHtml(project.logo) + '" alt=""></span>'
          : '') +
        '<h1 class="sheen-text">' + escapeHtml(project.name) + '</h1>' +
        '<p class="vcp-detail-header__thesis">' + escapeHtml(project.one_liner) + '</p>' +
      '</header>'
    );
  }

  // Overview — rich text (trusted HTML from our own data file).
  function renderOverview(project, num) {
    return (
      '<section class="detail-section" id="overview">' +
        sectionHeading(num, 'Overview') +
        '<div class="vcp-prose" style="max-width: 72ch;">' + project.overview + '</div>' +
      '</section>'
    );
  }

  // Article — case-study blocks of {heading, html, image}, rendered as a 3D
  // click-through carousel (js/vcp-carousel.js): an empty slot is emitted
  // here and filled after the section lands in the DOM.
  function renderArticle(project, num) {
    return (
      '<section class="detail-section" id="article">' +
        sectionHeading(num, 'Inside the product') +
        '<div class="vcp-article" data-carousel-slot style="max-width: 72ch;"></div>' +
      '</section>'
    );
  }

  // Channels & pricing — channel-manager story: intro prose, the distro card
  // (js/vcp-distro.js), then the dynamic-pricing prose and the illustrative
  // rate calculator (js/vcp-rate-calc.js). Slots fill after DOM insert.
  function renderChannels(project, num) {
    var cp = project.channels_pricing;
    return (
      '<section class="detail-section" id="channels-pricing">' +
        sectionHeading(num, 'Channel manager & dynamic pricing') +
        '<div style="max-width: 72ch;">' +
          '<div class="vcp-prose">' + cp.intro + '</div>' +
          '<div data-distro-slot></div>' +
          '<h3 style="margin: var(--space-5) 0 var(--space-3);">' + escapeHtml(cp.pricing_heading) + '</h3>' +
          '<div class="vcp-prose">' + cp.pricing_html + '</div>' +
          '<div data-calc-slot></div>' +
        '</div>' +
      '</section>'
    );
  }

  // Extra sections — project-specific prose sections ({title, html}) that
  // don't warrant their own renderer. Numbered like every other section.
  // An optional `aside` (trusted HTML, e.g. a large decorative SVG) renders
  // as a centered figure below the prose (vcp-section-figure).
  function renderExtraSection(section, num) {
    var figure = section.aside
      ? '<div class="vcp-section-figure">' + section.aside + '</div>'
      : '';
    return (
      '<section class="detail-section">' +
        sectionHeading(num, section.title) +
        '<div class="vcp-prose" style="max-width: 72ch;">' + section.html + figure + '</div>' +
      '</section>'
    );
  }

  // Timeline — list of {date, title, note}. Must handle 1, 5, 20+ items.
  function renderTimeline(project, num) {
    var items = project.timeline.map(function (m) {
      return (
        '<li class="vcp-timeline__item">' +
          '<span class="vcp-timeline__dot" aria-hidden="true"></span>' +
          '<div class="vcp-timeline__date">' + escapeHtml(m.date) + '</div>' +
          '<h3 class="vcp-timeline__title">' + escapeHtml(m.title) + '</h3>' +
          '<p class="vcp-timeline__note">' + escapeHtml(m.note) + '</p>' +
        '</li>'
      );
    }).join('');

    return (
      '<section class="detail-section" id="timeline">' +
        sectionHeading(num, 'Timeline') +
        '<ol class="vcp-timeline" style="max-width: 72ch;">' + items + '</ol>' +
      '</section>'
    );
  }

  // Moat — highlighted panel.
  function renderMoat(project, num) {
    return (
      '<section class="detail-section" id="moat">' +
        sectionHeading(num, 'Moat') +
        '<div class="vcp-panel" style="max-width: 72ch;">' +
          '<div class="label-caps label-caps--wide vcp-panel__label">Defensibility</div>' +
          '<div class="vcp-prose">' + project.moat + '</div>' +
        '</div>' +
      '</section>'
    );
  }

  // Business model — rich text, may include a simple table. When the project
  // carries a `chart` spec, an empty slot is emitted here and filled by
  // js/vcp-chart.js after the section lands in the DOM.
  function renderBusinessModel(project, num) {
    return (
      '<section class="detail-section" id="business-model">' +
        sectionHeading(num, 'Business model') +
        '<div class="vcp-prose" style="max-width: 72ch;">' + project.business_model + '</div>' +
        (isBlank(project.chart) ? '' : '<div data-chart-slot style="max-width: 72ch;"></div>') +
      '</section>'
    );
  }

  // Specifics — flexible key-value block. URL values render as links.
  function renderSpecifics(project, num) {
    var rows = Object.keys(project.specifics).map(function (key) {
      var value = project.specifics[key];
      var valueHtml = /^https?:\/\//.test(String(value))
        ? '<a class="vcp-link" href="' + escapeHtml(value) + '" target="_blank" rel="noopener">' + escapeHtml(value) + '</a>'
        : escapeHtml(value);
      return (
        '<div>' +
          '<dt>' + escapeHtml(key) + '</dt>' +
          '<dd>' + valueHtml + '</dd>' +
        '</div>'
      );
    }).join('');

    return (
      '<section class="detail-section" id="specifics">' +
        sectionHeading(num, 'Specifics') +
        '<div class="vcp-card" style="max-width: 72ch;"><div class="vcp-card__body">' +
          '<dl class="vcp-kv">' + rows + '</dl>' +
        '</div></div>' +
      '</section>'
    );
  }

  // Related — refs to research topics / library papers.
  function relatedGroups(project) {
    if (isBlank(project.related)) return [];
    var groups = [];
    if (!isBlank(project.related.research)) groups.push({ label: 'Research', items: project.related.research });
    if (!isBlank(project.related.library)) groups.push({ label: 'Library', items: project.related.library });
    return groups;
  }

  function renderRelated(project, num) {
    var groups = relatedGroups(project);

    var lists = groups.map(function (group) {
      var items = group.items.map(function (item) {
        return (
          '<li>' +
            '<span>' +
              '<span class="vcp-tag--caps label-caps">' + escapeHtml(group.label) + '</span>' +
              '<span style="margin-left: var(--space-3); font-family: var(--font-display); font-size: var(--fs-20); color: var(--silver-bright);">' + escapeHtml(item.label) + '</span>' +
            '</span>' +
            '<a class="vcp-link" href="' + escapeHtml(item.href) + '">View &rarr;</a>' +
          '</li>'
        );
      }).join('');
      return items;
    }).join('');

    return (
      '<section class="detail-section" id="related">' +
        sectionHeading(num, 'Related') +
        '<ul class="related-list" style="max-width: 72ch;">' + lists + '</ul>' +
      '</section>'
    );
  }

  function renderProject(project) {
    document.title = project.name + ' — VCP Portfolio';

    // Each section that actually has content takes the next number starting
    // at 01 (the site convention, see demo.html), so minimal entries never
    // show gaps in the numbering.
    var sectionDefs = [
      { blank: isBlank(project.overview), render: renderOverview },
      { blank: isBlank(project.article), render: renderArticle },
      { blank: isBlank(project.channels_pricing), render: renderChannels }
    ];

    (project.extra_sections || []).forEach(function (section) {
      sectionDefs.push({
        blank: isBlank(section.html),
        render: function (p, num) { return renderExtraSection(section, num); }
      });
    });

    sectionDefs = sectionDefs.concat([
      { blank: isBlank(project.timeline), render: renderTimeline },
      { blank: isBlank(project.moat), render: renderMoat },
      { blank: isBlank(project.business_model), render: renderBusinessModel },
      { blank: isBlank(project.specifics), render: renderSpecifics },
      { blank: relatedGroups(project).length === 0, render: renderRelated }
    ]);

    var sections = [renderHeader(project)];
    var next = 1;
    sectionDefs.forEach(function (def) {
      if (def.blank) return;
      sections.push(def.render(project, ('0' + next).slice(-2)));
      next++;
    });

    root.innerHTML = sections.join('');

    var chartSlot = root.querySelector('[data-chart-slot]');
    if (chartSlot && window.VCPChart) {
      window.VCPChart.render(chartSlot, project.chart);
    }

    var carouselSlot = root.querySelector('[data-carousel-slot]');
    if (carouselSlot && window.VCPCarousel) {
      var chromeUrl = '';
      try { chromeUrl = new URL(project.website).host.replace(/^www\./, ''); } catch (e) {}
      window.VCPCarousel.render(carouselSlot, {
        blocks: project.article,
        chromeUrl: chromeUrl,
        label: project.name + ' product walkthrough'
      });
    }

    var distroSlot = root.querySelector('[data-distro-slot]');
    if (distroSlot && window.VCPDistro) {
      window.VCPDistro.render(distroSlot, project.channels_pricing.distribution);
    }

    var calcSlot = root.querySelector('[data-calc-slot]');
    if (calcSlot && window.VCPRateCalc) {
      window.VCPRateCalc.render(calcSlot, project.channels_pricing.calc);
    }
  }

  function renderNotFound() {
    root.innerHTML =
      '<div class="detail-notfound">' +
        '<p>This project could not be found.</p>' +
        '<p><a class="vcp-link" href="projects.html">&larr; Back to the portfolio</a></p>' +
      '</div>';
  }

  var slug = getSlugFromUrl();
  if (!slug) {
    renderNotFound();
  } else {
    window.VCPProjects.getProjectBySlug(slug)
      .then(function (project) {
        if (!project) {
          renderNotFound();
        } else {
          renderProject(project);
        }
      })
      .catch(function (err) {
        console.error(err);
        root.innerHTML = '<p class="detail-notfound">Could not load this project right now.</p>';
      });
  }
})();
