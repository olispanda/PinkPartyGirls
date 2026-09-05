/* ==========================================================================
   CMS renderer — pulls editable content from /content/*.json and injects it
   into the page. The static HTML holds the default copy as a fallback, so the
   site still works if a fetch fails or JavaScript is disabled.

   Content is edited through the admin panel at /admin (Decap CMS).
   ========================================================================== */
(function () {
  "use strict";

  var BASE = "content/";

  function load(name) {
    return fetch(BASE + name + ".json", { cache: "no-cache" })
      .then(function (res) {
        if (!res.ok) throw new Error(name + ".json → " + res.status);
        return res.json();
      })
      .catch(function (err) {
        console.warn("[cms]", err.message || err);
        return null;
      });
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function all(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function fill(selector, value, root) {
    if (value == null || value === "") return;
    all(selector, root).forEach(function (node) { node.textContent = value; });
  }

  function isExternal(url) {
    return /^(https?:)?\/\//i.test(url || "");
  }

  function linkAttrs(url) {
    return isExternal(url) ? ' target="_blank" rel="noopener"' : "";
  }

  /* ---- shared: nav, footer, social links (every page) ------------------ */

  function renderSettings(data) {
    if (!data) return;

    fill('[data-cms="footer-copy"]', data.footer_copy);

    if (Array.isArray(data.social)) {
      var html = data.social
        .filter(function (item) { return item && item.label; })
        .map(function (item) {
          var url = item.url || "#";
          return '<a href="' + esc(url) + '"' + linkAttrs(url) + ">" + esc(item.label) + "</a>";
        })
        .join("\n");
      all('[data-cms="social"]').forEach(function (node) { node.innerHTML = html; });
    }
  }

  /* ---- page header (About / Music / Shows / Contact) ------------------ */

  function renderHeader(data) {
    if (!data) return;
    var header = document.querySelector(".page-header");
    if (header) {
      fill(".section-title", data.title, header);
      fill(".section-lede", data.lede, header);
    }
    if (data.title) {
      document.title = data.title + " — " + (window.__bandName || "Pink Party Girls");
    }
  }

  /* ---- home ---------------------------------------------------------- */

  function renderHome(d) {
    if (!d) return;

    var video = document.querySelector(".slide-home__video");
    if (video && d.hero_video) {
      var source = video.querySelector("source");
      if (source && source.getAttribute("src") !== d.hero_video) {
        source.setAttribute("src", d.hero_video);
        video.load();
      }
    }

    var logo = document.querySelector(".slide-home__logo");
    if (logo && d.hero_logo) logo.setAttribute("src", d.hero_logo);

    fill(".slide-statement__heading", d.statement_heading);

    var btn = document.querySelector(".btn-dark-outline");
    if (btn) {
      if (d.statement_button_link) btn.setAttribute("href", d.statement_button_link);
      if (d.statement_button_label) {
        btn.textContent = d.statement_button_label; /* arrow is added via CSS ::after */
      }
    }

    fill(".slide-events__heading", d.events_heading);

    // The homepage teaser reuses the Shows page list + data, so tour dates
    // only ever need maintaining in one place (content/shows.json).
    var teaser = document.querySelector("#events-teaser-list");
    if (teaser) {
      load("shows").then(function (sd) {
        if (!sd || !Array.isArray(sd.shows) || !sd.shows.length) return;
        var upcoming = sd.shows.filter(function (s) { return !isPast(s.date); });
        var pick = (upcoming.length ? upcoming : sd.shows).slice(0, 3);
        teaser.innerHTML = pick.map(showItemHTML).join("");
      });
    }
  }

  /* ---- about -------------------------------------------------------- */

  function renderAbout(d) {
    if (!d) return;
    renderHeader(d);

    var bio = document.querySelector("#about-bio");
    if (bio && Array.isArray(d.bio) && d.bio.length) {
      bio.innerHTML = d.bio
        .filter(Boolean)
        .map(function (p, i, arr) {
          var last = i === arr.length - 1;
          return (
            '<p style="' +
            (last ? "" : "margin-bottom:1.25rem; ") +
            'color:var(--text-muted);">' +
            esc(p) +
            "</p>"
          );
        })
        .join("");
    }

    fill('[data-cms="lineup-eyebrow"]', d.lineup_eyebrow);
    fill('[data-cms="lineup-title"]', d.lineup_title);

    var lineup = document.querySelector("#about-lineup");
    if (lineup && Array.isArray(d.members) && d.members.length) {
      lineup.innerHTML = d.members
        .map(function (m) {
          var photo = m.photo
            ? '<div class="member__photo" style="padding:0;overflow:hidden;">' +
              '<img src="' + esc(m.photo) + '" alt="' + esc(m.name) +
              '" style="width:100%;height:100%;object-fit:cover;border-radius:18px;" /></div>'
            : '<div class="member__photo">Photo</div>';
          return (
            '<div class="member">' +
            photo +
            "<h3>" + esc(m.name) + "</h3>" +
            '<span class="role">' + esc(m.role) + "</span>" +
            "</div>"
          );
        })
        .join("");
    }

    var quote = document.querySelector("#about-quote");
    if (quote && d.quote) {
      quote.innerHTML = esc(d.quote) + "<cite>" + esc(d.quote_cite) + "</cite>";
    }
  }

  /* ---- music ------------------------------------------------------- */

  function renderMusic(d) {
    if (!d) return;
    renderHeader(d);

    var grid = document.querySelector("#music-grid");
    if (grid && Array.isArray(d.releases) && d.releases.length) {
      grid.innerHTML = d.releases
        .map(function (r) {
          var art = r.cover
            ? '<div class="card__art" style="padding:0;">' +
              '<img src="' + esc(r.cover) + '" alt="' + esc(r.title) +
              '" style="width:100%;height:100%;object-fit:cover;" /></div>'
            : '<div class="card__art">Cover Art</div>';

          var meta = [r.type, r.year].filter(Boolean).join(" &middot; ");

          var links = [
            ["Spotify", r.spotify],
            ["Apple Music", r.apple],
            ["YouTube", r.youtube],
          ]
            .filter(function (x) { return x[1] && x[1] !== "#"; })
            .map(function (x) {
              return '<a href="' + esc(x[1]) + '"' + linkAttrs(x[1]) + ">" + x[0] + "</a>";
            })
            .join("\n");

          return (
            '<div class="card">' +
            art +
            '<div class="card__body">' +
            "<h3>" + esc(r.title) + "</h3>" +
            '<p class="card__meta">' + meta + "</p>" +
            (links ? '<div class="card__links">' + links + "</div>" : "") +
            "</div>" +
            "</div>"
          );
        })
        .join("");
    }
  }

  /* ---- shows ------------------------------------------------------- */

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function showDate(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
    if (m) {
      return { day: m[3], month: MONTHS[parseInt(m[2], 10) - 1] || "" };
    }
    // fall back: "14 Sep" style or raw text
    var parts = String(value || "").trim().split(/\s+/);
    return { day: parts[0] || "", month: parts[1] || "" };
  }

  function isPast(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
    if (!m) return false;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(+m[1], +m[2] - 1, +m[3]) < today;
  }

  // One row of the .show-list component, shared by the Shows page and the
  // homepage "Our Next Events" teaser.
  function showItemHTML(s) {
    var dt = showDate(s.date);
    var ticket =
      s.tickets_url && s.tickets_url !== "#"
        ? '<a href="' + esc(s.tickets_url) + '"' + linkAttrs(s.tickets_url) +
          ' class="btn btn--outline btn--external">Tickets</a>'
        : '<a href="#" class="btn btn--outline btn--external">Tickets</a>';
    return (
      '<div class="show">' +
      '<div class="show__date"><span class="day">' + esc(dt.day) +
      '</span><span class="month">' + esc(dt.month) + "</span></div>" +
      '<div class="show__info"><h3>' + esc(s.title) + "</h3>" +
      "<p>" + esc(s.location) + "</p></div>" +
      ticket +
      "</div>"
    );
  }

  function renderShows(d) {
    if (!d) return;
    renderHeader(d);

    var list = document.querySelector("#shows-list");
    if (list && Array.isArray(d.shows) && d.shows.length) {
      list.innerHTML = d.shows.map(showItemHTML).join("");
    }
  }

  /* ---- contact --------------------------------------------------- */

  function renderContact(d) {
    if (!d) return;
    renderHeader(d);

    all('[data-cms="booking-email"]').forEach(function (a) {
      if (!d.booking_email) return;
      a.setAttribute("href", "mailto:" + d.booking_email);
      a.textContent = d.booking_email;
    });
    all('[data-cms="press-email"]').forEach(function (a) {
      if (!d.press_email) return;
      a.setAttribute("href", "mailto:" + d.press_email);
      a.textContent = d.press_email;
    });
  }

  /* ---- boot ------------------------------------------------------ */

  var PAGES = {
    home: renderHome,
    about: renderAbout,
    music: renderMusic,
    shows: renderShows,
    contact: renderContact,
  };

  function boot() {
    load("settings").then(function (settings) {
      if (settings && settings.band_name) window.__bandName = settings.band_name;
      renderSettings(settings);
    });

    var page = document.body.getAttribute("data-cms-page");
    var render = PAGES[page];
    if (render) load(page).then(render);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
