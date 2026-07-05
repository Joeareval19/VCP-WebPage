// Socials page renderer — vanilla JS, no framework, no build step.
// Reads data/socials.json and renders the link list. See issue #30.
(function () {
  "use strict";

  var DATA_URL = "data/socials.json";
  var listEl = document.getElementById("socials-list__items");

  if (!listEl) return;

  fetch(DATA_URL)
    .then(function (res) {
      if (!res.ok) throw new Error("Failed to load " + DATA_URL + " (" + res.status + ")");
      return res.json();
    })
    .then(function (data) {
      renderSocials(Array.isArray(data.socials) ? data.socials : []);
    })
    .catch(function (err) {
      renderError();
      // eslint-disable-next-line no-console
      console.error("[socials] could not render social links:", err);
    });

  function renderSocials(socials) {
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
    icon.textContent = entry.icon || initials(entry.platform);

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

  function renderError() {
    listEl.innerHTML = '<li class="socials-error">Social links are temporarily unavailable.</li>';
  }
})();
