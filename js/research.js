/* VCP Research page — grid render + client-side tag filter.
   Vanilla JS, no framework, no build step. Data source: data/research-topics.json */
(function () {
  'use strict';

  var DATA_URL = 'data/research-topics.json';
  var grid = document.getElementById('research-grid');
  var filterRow = document.getElementById('research-filters');
  var emptyState = document.getElementById('research-empty');
  var activeTag = null;
  var topics = [];

  function formatDate(iso) {
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function uniqueTags(items) {
    var seen = [];
    items.forEach(function (topic) {
      (topic.tags || []).forEach(function (tag) {
        if (seen.indexOf(tag) === -1) seen.push(tag);
      });
    });
    seen.sort(function (a, b) { return a.localeCompare(b); });
    return seen;
  }

  function renderFilters(tags) {
    var frag = document.createDocumentFragment();

    var allChip = document.createElement('button');
    allChip.type = 'button';
    allChip.className = 'vcp-tag vcp-tag--filter research-filter-chip';
    allChip.dataset.tag = '';
    allChip.setAttribute('aria-pressed', 'true');
    allChip.textContent = 'All';
    frag.appendChild(allChip);

    tags.forEach(function (tag) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'vcp-tag vcp-tag--filter research-filter-chip';
      chip.dataset.tag = tag;
      chip.setAttribute('aria-pressed', 'false');
      chip.textContent = tag;
      frag.appendChild(chip);
    });

    filterRow.appendChild(frag);
    filterRow.addEventListener('click', function (evt) {
      var chip = evt.target.closest('.research-filter-chip');
      if (!chip) return;
      activeTag = chip.dataset.tag || null;
      updateChipStates();
      renderGrid();
    });
  }

  function updateChipStates() {
    var chips = filterRow.querySelectorAll('.research-filter-chip');
    chips.forEach(function (chip) {
      var isActive = (chip.dataset.tag || null) === activeTag;
      chip.setAttribute('aria-pressed', String(isActive));
    });
  }

  function cardTemplate(topic) {
    var tagsHtml = (topic.tags || [])
      .map(function (tag) { return '<span class="vcp-tag">' + escapeHtml(tag) + '</span>'; })
      .join('');

    var papersHtml = '';
    if (topic.related_papers && topic.related_papers.length) {
      var linksHtml = topic.related_papers
        .map(function (paper) {
          return '<a class="vcp-link research-card__paper-link" href="/library.html#' +
            encodeURIComponent(paper.slug) + '">' + escapeHtml(paper.title) + ' →</a>';
        })
        .join('');
      papersHtml =
        '<div class="research-card__papers">' +
          '<span class="label-caps">Related papers</span>' +
          '<div class="research-card__paper-links">' + linksHtml + '</div>' +
        '</div>';
    }

    return (
      '<article class="vcp-card research-card" data-tags="' + escapeHtml((topic.tags || []).join('|')) + '">' +
        '<div class="vcp-card__body">' +
          '<div class="vcp-card__eyebrow">' +
            '<span class="vcp-tag--caps label-caps">Research</span>' +
            '<span class="vcp-card__eyebrow-rule"></span>' +
            '<span class="meta-mono">' + escapeHtml(formatDate(topic.updated)) + '</span>' +
          '</div>' +
          '<h3 class="vcp-card__title">' + escapeHtml(topic.title) + '</h3>' +
          '<p class="research-card__summary">' + escapeHtml(topic.summary) + '</p>' +
          '<div class="research-card__tags">' + tagsHtml + '</div>' +
          papersHtml +
        '</div>' +
      '</article>'
    );
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = String(str == null ? '' : str);
    return div.innerHTML;
  }

  function renderGrid() {
    var visible = activeTag
      ? topics.filter(function (topic) { return (topic.tags || []).indexOf(activeTag) !== -1; })
      : topics;

    grid.innerHTML = visible.map(cardTemplate).join('');
    emptyState.hidden = visible.length !== 0;
  }

  function init(items) {
    topics = items;
    renderFilters(uniqueTags(items));
    renderGrid();
  }

  fetch(DATA_URL)
    .then(function (res) {
      if (!res.ok) throw new Error('Failed to load research topics: ' + res.status);
      return res.json();
    })
    .then(init)
    .catch(function (err) {
      grid.innerHTML = '';
      emptyState.hidden = false;
      emptyState.textContent = 'Research topics could not be loaded right now.';
      console.error(err);
    });
})();
