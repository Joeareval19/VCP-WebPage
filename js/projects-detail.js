/**
 * VCP Projects — detail page renderer.
 *
 * Single template shared by every project: reads ?slug= from the URL,
 * looks up the matching entry in data/projects.json (via js/projects-data.js),
 * and renders all 7 sections (header, overview, timeline, moat, business
 * model, specifics, related). Optional sections (moat, business_model,
 * specifics, related) are omitted entirely — heading and all — when the
 * underlying data is null/empty, per the acceptance criteria.
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
        '<p class="detail-back"><a class="vcp-link" href="projects.html">&larr; All projects</a></p>' +
        '<div class="vcp-detail-header__meta" style="margin-top: var(--space-4);">' +
          '<span class="vcp-tag vcp-tag--dot">' + escapeHtml(project.status) + '</span>' +
          '<span class="vcp-tag">' + escapeHtml(project.client || 'Confidential') + '</span>' +
        '</div>' +
        '<h1 class="sheen-text">' + escapeHtml(project.name) + '</h1>' +
        '<p class="vcp-detail-header__thesis">' + escapeHtml(project.one_liner) + '</p>' +
      '</header>'
    );
  }

  // 2. Overview — required, rich text (trusted HTML from our own data file).
  function renderOverview(project) {
    return (
      '<section class="detail-section" id="overview">' +
        sectionHeading('02', 'Overview') +
        '<div class="vcp-prose" style="max-width: 72ch;">' + project.overview + '</div>' +
      '</section>'
    );
  }

  // 3. Timeline — required, list of {date, title, note}. Must handle 1, 5, 20+ items.
  function renderTimeline(project) {
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
        sectionHeading('03', 'Timeline') +
        '<ol class="vcp-timeline" style="max-width: 72ch;">' + items + '</ol>' +
      '</section>'
    );
  }

  // 4. Moat — optional, highlighted panel. Omit entirely (heading included) if absent.
  function renderMoat(project) {
    if (isBlank(project.moat)) return '';
    return (
      '<section class="detail-section" id="moat">' +
        sectionHeading('04', 'Moat') +
        '<div class="vcp-panel" style="max-width: 72ch;">' +
          '<div class="label-caps label-caps--wide vcp-panel__label">Defensibility</div>' +
          '<div class="vcp-prose">' + project.moat + '</div>' +
        '</div>' +
      '</section>'
    );
  }

  // 5. Business model — optional, rich text, may include a simple table.
  function renderBusinessModel(project) {
    if (isBlank(project.business_model)) return '';
    return (
      '<section class="detail-section" id="business-model">' +
        sectionHeading('05', 'Business model') +
        '<div class="vcp-prose" style="max-width: 72ch;">' + project.business_model + '</div>' +
      '</section>'
    );
  }

  // 6. Specifics — optional, flexible key-value block.
  function renderSpecifics(project) {
    if (isBlank(project.specifics)) return '';
    var rows = Object.keys(project.specifics).map(function (key) {
      return (
        '<div>' +
          '<dt>' + escapeHtml(key) + '</dt>' +
          '<dd>' + escapeHtml(project.specifics[key]) + '</dd>' +
        '</div>'
      );
    }).join('');

    return (
      '<section class="detail-section" id="specifics">' +
        sectionHeading('06', 'Specifics') +
        '<div class="vcp-card" style="max-width: 72ch;"><div class="vcp-card__body">' +
          '<dl class="vcp-kv">' + rows + '</dl>' +
        '</div></div>' +
      '</section>'
    );
  }

  // 7. Related — optional, refs to research topics / library papers.
  function renderRelated(project) {
    if (isBlank(project.related)) return '';
    var groups = [];
    if (!isBlank(project.related.research)) groups.push({ label: 'Research', items: project.related.research });
    if (!isBlank(project.related.library)) groups.push({ label: 'Library', items: project.related.library });
    if (groups.length === 0) return '';

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
        sectionHeading('07', 'Related') +
        '<ul class="related-list" style="max-width: 72ch;">' + lists + '</ul>' +
      '</section>'
    );
  }

  function renderProject(project) {
    document.title = project.name + ' — VCP Projects';

    var sections = [
      renderHeader(project),
      renderOverview(project),
      renderTimeline(project),
      renderMoat(project),
      renderBusinessModel(project),
      renderSpecifics(project),
      renderRelated(project)
    ].filter(function (html) { return html !== ''; });

    root.innerHTML = sections.join('');
  }

  function renderNotFound() {
    root.innerHTML =
      '<div class="detail-notfound">' +
        '<p>This project could not be found.</p>' +
        '<p><a class="vcp-link" href="projects.html">&larr; Back to all projects</a></p>' +
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
