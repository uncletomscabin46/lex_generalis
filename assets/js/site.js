/* ==========================================================================
   site.js — page behaviour. Each page opts in via <body data-page="...">.
   ========================================================================== */

(function () {
  "use strict";

  var CFG = window.LG_CONFIG || {};
  var $  = function (s, r) { return (r || document).querySelector(s); };

  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "class") n.className = attrs[k];
      else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    });
    if (html !== undefined) n.innerHTML = html;
    return n;
  }

  function esc(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function param(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function setState(node, message, isError) {
    node.innerHTML = "";
    node.appendChild(el("p", { class: "state" + (isError ? " state--error" : "") }, esc(message)));
  }

  /* ------------------------------------------------- reveal on scroll --- */

  function initReveal() {
    var items = document.querySelectorAll(".reveal");
    if (!items.length) return;
    if (!("IntersectionObserver" in window)) {
      items.forEach(function (n) { n.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    items.forEach(function (n) { io.observe(n); });
  }

  /* ------------------------------------------------------ team roster --- */

  function personCard(p, linkable) {
    var inner =
      '<div class="person__frame">' +
        (p.photo
          ? '<img src="' + esc(p.photo) + '" alt="' + esc(p.name) + '" loading="lazy">'
          : "") +
      "</div>" +
      '<h3 class="person__name">' + esc(p.name) + "</h3>" +
      '<p class="person__role">' + esc(p.role) + "</p>" +
      (p.bar ? '<p class="person__bar">' + esc(p.bar) + "</p>" : "");

    var links = [];
    if (linkable && p.wpSlug) {
      links.push('<a href="/attorney?slug=' + encodeURIComponent(p.wpSlug) + '">Profile</a>');
    }
    if (p.linkedin) {
      links.push('<a href="' + esc(p.linkedin) + '" target="_blank" rel="noopener noreferrer">LinkedIn</a>');
    }
    if (links.length) {
      inner += '<div class="person__links">' + links.join("") + "</div>";
    }

    if (linkable && p.wpSlug) {
      return el("a", {
        class: "person",
        href: "/attorney?slug=" + encodeURIComponent(p.wpSlug)
      }, inner);
    }
    return el("div", { class: "person" }, inner);
  }

  function renderRoster(mount, people, linkable) {
    mount.innerHTML = "";
    var grid = el("div", { class: "grid grid--4" });
    people.forEach(function (p) { grid.appendChild(personCard(p, linkable)); });
    mount.appendChild(grid);
  }

  function loadTeam(opts) {
    var legalMount = $(opts.legal);
    var opsMount = opts.operations ? $(opts.operations) : null;

    return fetch("data/team.json")
      .then(function (r) {
        if (!r.ok) throw new Error("Could not load team.json");
        return r.json();
      })
      .then(function (data) {
        if (legalMount) renderRoster(legalMount, data.legal || [], opts.linkable);
        if (opsMount) renderRoster(opsMount, data.operations || [], false);
        initReveal();
      })
      .catch(function (err) {
        if (legalMount) setState(legalMount, "Our team listing is unavailable right now.", true);
        console.error(err);
      });
  }

  /* ------------------------------------------------------- blog index --- */

  /* "Jane Doe, Partner" — name in ink, role beside it in muted. */
  function bylineHtml(authors) {
    if (!authors || !authors.length) return "";
    var parts = authors.map(function (a) {
      return '<span class="byline__name">' + esc(a.name) + "</span>" +
             (a.role ? '<span class="byline__role">, ' + esc(a.role) + "</span>" : "");
    });
    return '<p class="post-card__byline">' + parts.join('<span class="byline__and">and</span>') + "</p>";
  }

  function postCard(p) {
    var card = el("a", { class: "post-card", href: "/post?slug=" + encodeURIComponent(p.slug) });
    card.innerHTML =
      '<p class="post-card__meta">' + esc(p.dateLabel) + "</p>" +
      '<h2 class="post-card__title">' + esc(p.title) + "</h2>" +
      '<div class="post-card__excerpt"><p>' + esc(p.excerpt) + "</p></div>" +
      bylineHtml(p.authors);
    return card;
  }

  function blogSkeleton(mount, count) {
    mount.innerHTML = "";
    for (var i = 0; i < count; i++) {
      mount.appendChild(el("div", { class: "post-card" },
        '<div class="skeleton sk-line" style="width:120px"></div>' +
        '<div class="skeleton sk-title"></div>' +
        '<div class="skeleton sk-line"></div>' +
        '<div class="skeleton sk-line" style="width:80%"></div>'));
    }
  }

  function initBlog() {
    var mount = $("#post-list");
    var pager = $("#pager");
    if (!mount) return;

    var page = Math.max(1, parseInt(param("page") || "1", 10) || 1);
    blogSkeleton(mount, 4);

    WP.getPosts({ page: page, perPage: CFG.postsPerPage })
      .then(function (res) {
        if (!res.posts.length) {
          setState(mount, "No articles have been published yet.");
          return;
        }
        mount.innerHTML = "";
        res.posts.forEach(function (p) { mount.appendChild(postCard(p)); });

        if (pager && res.totalPages > 1) {
          pager.innerHTML = "";
          if (page > 1) {
            pager.appendChild(el("a", { class: "btn", href: "/blog?page=" + (page - 1) }, "← Newer"));
          }
          pager.appendChild(el("span", { class: "article-meta" },
            "Page " + page + " of " + res.totalPages));
          if (page < res.totalPages) {
            pager.appendChild(el("a", { class: "btn", href: "/blog?page=" + (page + 1) }, "Older →"));
          }
        }
      })
      .catch(function (err) {
        console.error(err);
        setState(mount,
          "We couldn't reach the article feed just now. Please try again shortly.", true);
      });
  }

  /* ------------------------------------------------------ single post --- */

  function initPost() {
    var mount = $("#post-body");
    if (!mount) return;

    var slug = param("slug");
    if (!slug) { window.location.replace("/blog"); return; }

    mount.innerHTML =
      '<div class="skeleton sk-line" style="width:60%"></div>' +
      '<div class="skeleton sk-line"></div><div class="skeleton sk-line"></div>' +
      '<div class="skeleton sk-line" style="width:75%"></div>';

    WP.getPostBySlug(slug)
      .then(function (p) {
        document.title = p.title + " · Lex Generalis";
        var titleEl = $("#post-title");
        var dateEl = $("#post-date");
        if (titleEl) titleEl.textContent = p.title;
        if (dateEl) {
          /* Prefer the structured author over the byline scraped from the
             post body — the body line is not present on every article. */
          var who = (p.authors && p.authors.length)
            ? p.authors.map(function (a) {
                return a.role ? a.name + ", " + a.role : a.name;
              }).join(" and ")
            : (p.byline || "").replace(/^by\s+/i, "");
          dateEl.textContent = [p.dateLabel, who].filter(Boolean).join(" \u00b7 ");
        }

        var head = $("#post-head");
        if (head) head.hidden = false;

        var html = "";
        if (p.image) {
          html += '<img src="' + esc(p.image.url) + '" alt="' + esc(p.image.alt) + '">';
        }
        html += p.content;
        mount.innerHTML = html;
      })
      .catch(function (err) {
        console.error(err);
        var head = $("#post-head");
        if (head) head.hidden = false;
        var titleEl = $("#post-title");
        if (titleEl) titleEl.textContent = "Article unavailable";
        setState(mount, err.message === "NOT_FOUND"
          ? "We couldn't find that article. It may have been moved or unpublished."
          : "We couldn't load this article just now. Please try again shortly.", true);
      });
  }

  /* --------------------------------------------------- attorney pages --- */

  function initAttorneys() {
    var mount = $("#attorney-list");
    if (!mount) return;

    /* When WordPress exposes an attorney custom post type, take the roster
       straight from the API; otherwise fall back to data/team.json. */
    WP.listAttorneys()
      .then(function (list) {
        if (!list || !list.length) throw new Error("USE_LOCAL");
        renderRoster(mount, list.map(function (a) {
          return {
            name: a.name, role: a.role, bar: a.bar,
            photo: a.photo, linkedin: null, wpSlug: a.slug
          };
        }), true);
        initReveal();
      })
      .catch(function () {
        loadTeam({ legal: "#attorney-list", operations: "#operations-list", linkable: true });
      });
  }

  function initAttorney() {
    var mount = $("#bio-body");
    if (!mount) return;

    var slug = param("slug");
    if (!slug) { window.location.replace("/attorneys"); return; }

    mount.innerHTML =
      '<div class="skeleton sk-line"></div><div class="skeleton sk-line"></div>' +
      '<div class="skeleton sk-line" style="width:70%"></div>';

    WP.getAttorneyBySlug(slug)
      .then(function (a) {
        document.title = a.name + " · Lex Generalis";
        $("#bio-name").textContent = a.name;

        var roleEl = $("#bio-role");
        if (a.role) roleEl.textContent = a.role; else roleEl.hidden = true;

        var barEl = $("#bio-bar");
        if (a.bar) barEl.textContent = a.bar; else barEl.hidden = true;

        var photoEl = $("#bio-photo");
        if (a.photo) { photoEl.src = a.photo; photoEl.alt = a.name; }
        else photoEl.hidden = true;

        mount.innerHTML = a.content ||
          "<p>A full biography for this attorney is coming soon.</p>";
      })
      .catch(function (err) {
        console.error(err);
        $("#bio-name").textContent = "Profile unavailable";
        $("#bio-role").hidden = true;
        $("#bio-bar").hidden = true;
        var photoEl = $("#bio-photo");
        if (photoEl) photoEl.hidden = true;
        setState(mount, err.message === "NOT_FOUND"
          ? "We couldn't find that profile."
          : "We couldn't load this profile just now. Please try again shortly.", true);
      });
  }

  /* -------------------------------------------------------------- go --- */

  document.addEventListener("DOMContentLoaded", function () {
    var year = $("#year");
    if (year) year.textContent = new Date().getFullYear();

    initReveal();

    switch (document.body.getAttribute("data-page")) {
      case "home":      loadTeam({ legal: "#team-legal", operations: "#team-ops", linkable: true }); break;
      case "attorneys": initAttorneys(); break;
      case "attorney":  initAttorney(); break;
      case "blog":      initBlog(); break;
      case "post":      initPost(); break;
    }
  });
})();
