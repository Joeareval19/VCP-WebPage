// Socials page renderer — vanilla JS, no framework, no build step.
// Reads data/socials.json (grouped: company / personal) and renders one
// list per group. See issues #30, #72.
(function () {
  "use strict";

  var DATA_URL = "data/socials.json";

  // Official brand marks (24x24 viewBox path data), inlined so the page
  // makes zero icon-font/CDN requests. Rendered with fill=currentColor so
  // the .vcp-social chip's color and hover transition apply unchanged.
  var ICONS = {
    linkedin:
      "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
    x: "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932 6.064-6.932zm-1.291 19.491h2.039L6.486 3.24H4.298l13.312 17.404z",
    github:
      "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
    youtube:
      "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
    instagram:
      "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zm0 10.162a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"
  };

  var LISTS = {
    company: document.getElementById("socials-list__items--company"),
    personal: document.getElementById("socials-list__items--personal")
  };

  if (!LISTS.company && !LISTS.personal) return;

  fetch(DATA_URL)
    .then(function (res) {
      if (!res.ok) throw new Error("Failed to load " + DATA_URL + " (" + res.status + ")");
      return res.json();
    })
    .then(function (data) {
      var groups = Array.isArray(data.groups) ? data.groups : [];
      Object.keys(LISTS).forEach(function (id) {
        if (!LISTS[id]) return;
        var group = null;
        for (var i = 0; i < groups.length; i++) {
          if (groups[i] && groups[i].id === id) { group = groups[i]; break; }
        }
        renderSocials(LISTS[id], group && Array.isArray(group.socials) ? group.socials : []);
      });
    })
    .catch(function (err) {
      Object.keys(LISTS).forEach(function (id) {
        if (LISTS[id]) renderError(LISTS[id]);
      });
      // eslint-disable-next-line no-console
      console.error("[socials] could not render social links:", err);
    });

  function renderSocials(listEl, socials) {
    if (!socials.length) {
      listEl.innerHTML = '<li class="socials-empty">No social links published yet.</li>';
      return;
    }

    var isPlaceholder = function (entry) {
      return /placeholder/i.test(entry.handle || "") || /^#placeholder/i.test(entry.url || "");
    };

    var items = socials.map(function (entry) {
      return buildEntry(entry, isPlaceholder(entry));
    });

    listEl.replaceChildren.apply(listEl, items);
  }

  function buildEntry(entry, placeholder) {
    var li = document.createElement("li");

    var a = document.createElement("a");
    a.className = "socials-list__link";
    a.href = entry.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.setAttribute(
      "aria-label",
      entry.platform + (placeholder ? " (placeholder link, not yet live)" : "")
    );

    var icon = document.createElement("span");
    icon.className = "vcp-social";
    icon.setAttribute("aria-hidden", "true");
    var pathData = ICONS[entry.icon];
    if (pathData) {
      icon.innerHTML =
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="' +
        pathData +
        '"/></svg>';
    } else {
      icon.textContent = initials(entry.platform);
    }

    var platform = document.createElement("span");
    platform.className = "socials-list__platform";
    platform.textContent = entry.platform;

    var meta = document.createElement("span");
    meta.className = "socials-list__meta";

    var handle = document.createElement("span");
    handle.className = "socials-list__handle";
    handle.textContent = entry.handle;
    meta.appendChild(handle);

    if (placeholder) {
      var note = document.createElement("span");
      note.className = "placeholder-note";
      note.textContent = "[placeholder — not yet live]";
      meta.appendChild(note);
    }

    var arrow = document.createElement("span");
    arrow.className = "socials-list__arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "↗"; // north-east arrow, matches external-link convention

    a.appendChild(icon);
    a.appendChild(platform);
    a.appendChild(meta);
    a.appendChild(arrow);
    li.appendChild(a);
    return li;
  }

  function initials(platform) {
    return (platform || "?").trim().slice(0, 2).toUpperCase();
  }

  function renderError(listEl) {
    listEl.innerHTML = '<li class="socials-error">Social links are temporarily unavailable.</li>';
  }
})();
