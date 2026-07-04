/**
 * VCP Projects — shared data access.
 *
 * Single source of truth: data/projects.json. Both projects.html (index)
 * and project-detail.html (per-project template) read from this same file
 * client-side — there is no build step and no server, so "generated from
 * the same source" means "same JSON, two renderers." See js/projects-index.js
 * and js/projects-detail.js.
 */
(function (global) {
  'use strict';

  var DATA_URL = 'data/projects.json';
  var cache = null;

  /**
   * Fetch and cache the project list. Returns a Promise<Array<Project>>.
   */
  function loadProjects() {
    if (cache) return Promise.resolve(cache);
    return fetch(DATA_URL, { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load ' + DATA_URL + ' (' + res.status + ')');
        return res.json();
      })
      .then(function (data) {
        cache = data;
        return data;
      });
  }

  /**
   * Look up a single project by slug.
   */
  function getProjectBySlug(slug) {
    return loadProjects().then(function (projects) {
      return projects.find(function (p) { return p.slug === slug; }) || null;
    });
  }

  /** Escape text for safe HTML interpolation into non-rich-text fields. */
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  global.VCPProjects = {
    loadProjects: loadProjects,
    getProjectBySlug: getProjectBySlug,
    escapeHtml: escapeHtml
  };
})(window);
