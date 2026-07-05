/**
 * VCP Projects — index page renderer.
 * Renders the project card grid from data/projects.json and wires the
 * status filter chips. See js/projects-data.js for the shared data loader.
 */
(function () {
  'use strict';

  var grid = document.getElementById('projects-grid');
  var empty = document.getElementById('projects-empty');
  var filters = document.querySelectorAll('.vcp-tag--filter[data-filter]');
  var escapeHtml = window.VCPProjects.escapeHtml;
  var activeFilter = 'all';
  var allProjects = [];

  function cardHtml(project) {
    var clientTag = project.client
      ? escapeHtml(project.client)
      : 'Confidential';
    return (
      '<article class="vcp-card project-card">' +
        '<div class="vcp-card__body">' +
          '<div class="project-card__tags">' +
            '<span class="vcp-tag vcp-tag--dot">' + escapeHtml(project.status) + '</span>' +
            '<span class="vcp-tag">' + clientTag + '</span>' +
          '</div>' +
          (project.logo
            ? '<span class="vcp-logo-chip" style="margin-bottom: var(--space-3);"><img src="' + escapeHtml(project.logo) + '" alt="" loading="lazy"></span>'
            : '') +
          '<h3 class="vcp-card__title">' + escapeHtml(project.name) + '</h3>' +
          '<p style="font-size: var(--fs-14); margin: var(--space-3) 0 var(--space-4);">' + escapeHtml(project.one_liner) + '</p>' +
          '<div class="project-card__links">' +
            '<a class="vcp-link" href="project-detail.html?slug=' + encodeURIComponent(project.slug) + '">View project &rarr;</a>' +
            (project.website
              ? '<a class="vcp-link" href="' + escapeHtml(project.website) + '" target="_blank" rel="noopener">Visit site &nearr;</a>'
              : '') +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  function render() {
    var visible = allProjects.filter(function (p) {
      return activeFilter === 'all' || p.status === activeFilter;
    });

    grid.innerHTML = visible.map(cardHtml).join('');
    empty.style.display = visible.length === 0 ? 'block' : 'none';
  }

  function setActiveFilter(filter) {
    activeFilter = filter;
    filters.forEach(function (chip) {
      chip.setAttribute('aria-pressed', String(chip.dataset.filter === filter));
    });
    render();
  }

  filters.forEach(function (chip) {
    chip.addEventListener('click', function () {
      setActiveFilter(chip.dataset.filter);
    });
  });

  window.VCPProjects.loadProjects()
    .then(function (projects) {
      allProjects = projects;
      render();
    })
    .catch(function (err) {
      grid.innerHTML = '';
      empty.textContent = 'Could not load projects right now.';
      empty.style.display = 'block';
      console.error(err);
    });
})();
