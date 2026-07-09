/* VCP Library page — client-side render, filter, sort, and deep-link.
   No build step, no dependencies. See issue #5. */
(function () {
  'use strict';

  var DATA_URL = 'data/papers.json';

  var state = {
    papers: [],
    activeTags: new Set(),
    sort: 'date-desc'
  };

  var listEl = document.getElementById('paper-list');
  var chipsEl = document.getElementById('tag-chips');
  var sortSelect = document.getElementById('sort-select');
  var emptyEl = document.getElementById('paper-empty');
  var controlsEl = document.getElementById('library-controls');

  function formatDate(iso) {
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function allTags(papers) {
    var set = new Set();
    papers.forEach(function (p) { (p.tags || []).forEach(function (t) { set.add(t); }); });
    return Array.from(set).sort();
  }

  function renderChips() {
    var tags = allTags(state.papers);
    chipsEl.innerHTML = tags.map(function (tag) {
      var pressed = state.activeTags.has(tag);
      return '<button type="button" class="vcp-tag vcp-tag--filter" data-tag="' + escapeHtml(tag) + '" ' +
        'aria-pressed="' + pressed + '">' + escapeHtml(tag) + '</button>';
    }).join('');
  }

  function visiblePapers() {
    var list = state.papers.slice();

    if (state.activeTags.size > 0) {
      list = list.filter(function (p) {
        return (p.tags || []).some(function (t) { return state.activeTags.has(t); });
      });
    }

    list.sort(function (a, b) {
      var da = new Date(a.date + 'T00:00:00').getTime();
      var db = new Date(b.date + 'T00:00:00').getTime();
      return state.sort === 'date-asc' ? da - db : db - da;
    });

    return list;
  }

  function metaLine(paper) {
    var parts = [];
    parts.push('<span class="meta-mono">' + escapeHtml(formatDate(paper.date)) + '</span>');
    (paper.tags || []).forEach(function (t) {
      parts.push('<span class="vcp-tag--caps label-caps">' + escapeHtml(t) + '</span>');
    });
    var lengthBit = paper.reading_time
      ? paper.reading_time
      : (paper.pages ? paper.pages + ' pages' : '');
    if (lengthBit) parts.push('<span class="meta-mono">' + escapeHtml(lengthBit) + '</span>');
    return parts.join('<span aria-hidden="true" class="meta-mono">·</span>');
  }

  function paperRow(paper) {
    var fileHref = paper.file;
    var fileName = paper.slug + '.pdf';
    /* On-site HTML papers navigate in the same tab and have no PDF to
       download; external/PDF files keep the original two-link treatment. */
    var isPage = /\.html?$/i.test(fileHref);
    var actions = isPage
      ? '<a class="vcp-link" href="' + escapeHtml(fileHref) + '">Read →</a>'
      : '<a class="vcp-link" href="' + escapeHtml(fileHref) + '" target="_blank" rel="noopener">Read →</a>' +
        '<a class="vcp-link" href="' + escapeHtml(fileHref) + '" download="' + escapeHtml(fileName) + '">Download ↓</a>';
    return (
      '<article class="vcp-paper" id="' + escapeHtml(paper.slug) + '" data-slug="' + escapeHtml(paper.slug) + '" tabindex="-1">' +
        '<h3 class="vcp-paper__title">' + escapeHtml(paper.title) + '</h3>' +
        '<p class="vcp-paper__abstract">' + escapeHtml(paper.abstract) + '</p>' +
        '<div class="vcp-paper__meta">' + metaLine(paper) + '</div>' +
        '<div class="vcp-paper__actions">' + actions + '</div>' +
      '</article>'
    );
  }

  function render() {
    // Nothing published yet: hide the filter/sort controls entirely (there is
    // nothing to filter) and show the "coming soon" copy rather than the
    // filtered-to-nothing message.
    if (state.papers.length === 0) {
      if (controlsEl) controlsEl.hidden = true;
      listEl.innerHTML = '';
      emptyEl.textContent = 'No white papers published yet. VCP publishes each one here as it is finished — check back soon.';
      emptyEl.hidden = false;
      return;
    }

    if (controlsEl) controlsEl.hidden = false;
    var papers = visiblePapers();
    if (papers.length === 0) {
      listEl.innerHTML = '';
      emptyEl.textContent = 'No papers match the selected tags.';
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;
    listEl.innerHTML = papers.map(paperRow).join('');
  }

  function toggleTag(tag) {
    if (state.activeTags.has(tag)) {
      state.activeTags.delete(tag);
    } else {
      state.activeTags.add(tag);
    }
    renderChips();
    render();
  }

  /* Deep-link: /library.html#slug scrolls to and highlights the matching entry.
     Runs after render so the target element exists in the DOM. Also handles
     the hash changing later (e.g. Research/Projects linking in via JS nav). */
  function focusHash() {
    var hash = window.location.hash;
    if (!hash || hash.length < 2) return;
    var slug = decodeURIComponent(hash.slice(1));
    var target = document.getElementById(slug);
    if (!target) return;

    // Clear tag filters so a deep-linked entry is never hidden by an active filter.
    if (state.activeTags.size > 0) {
      state.activeTags.clear();
      renderChips();
      render();
      target = document.getElementById(slug);
      if (!target) return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('vcp-paper--highlight');
    target.focus({ preventScroll: true });
    window.setTimeout(function () {
      target.classList.remove('vcp-paper--highlight');
    }, 2600);
  }

  function init(papers) {
    state.papers = papers;
    renderChips();
    render();
    focusHash();

    chipsEl.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-tag]');
      if (!btn) return;
      toggleTag(btn.getAttribute('data-tag'));
    });

    sortSelect.addEventListener('change', function () {
      state.sort = sortSelect.value;
      render();
    });

    window.addEventListener('hashchange', focusHash);
  }

  fetch(DATA_URL)
    .then(function (res) {
      if (!res.ok) throw new Error('Failed to load papers.json: ' + res.status);
      return res.json();
    })
    .then(init)
    .catch(function (err) {
      listEl.innerHTML = '<p class="text-muted">Could not load the library index. ' + escapeHtml(err.message) + '</p>';
    });
})();
