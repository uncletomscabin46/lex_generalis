/* ==========================================================================
   wp.js — thin client for the WordPress REST API
   Docs: https://developer.wordpress.org/rest-api/reference/
   Every call is a plain public GET; no key or authentication is required.
   ========================================================================== */

(function (global) {
  "use strict";

  var CFG = global.LG_CONFIG || {};
  var BASE = (CFG.wpBase || "").replace(/\/+$/, "");

  /* ------------------------------------------------------------ fetch --- */

  function request(path, params) {
    var url = new URL(BASE + path);
    Object.keys(params || {}).forEach(function (k) {
      if (params[k] !== undefined && params[k] !== null && params[k] !== "") {
        url.searchParams.set(k, params[k]);
      }
    });

    return fetch(url.toString(), {
      headers: { Accept: "application/json" },
      credentials: "omit"
    }).then(function (res) {
      if (!res.ok) {
        throw new Error("WordPress API responded " + res.status);
      }
      return res.json().then(function (body) {
        return {
          body: body,
          total: parseInt(res.headers.get("X-WP-Total") || "0", 10),
          totalPages: parseInt(res.headers.get("X-WP-TotalPages") || "1", 10)
        };
      });
    });
  }

  /* ------------------------------------------------------ normalizing --- */

  function decodeEntities(str) {
    var el = document.createElement("textarea");
    el.innerHTML = str || "";
    return el.value;
  }

  /* WordPress + Divi emit deeply nested layout wrappers, inline <style> and
     <script>, and lazy-load attributes. Strip all of that and keep only the
     semantic content, so the markup inherits this site's typography. */
  var ALLOWED = {
    P:1, BR:1, STRONG:1, B:1, EM:1, I:1, U:1, A:1, UL:1, OL:1, LI:1,
    H1:1, H2:1, H3:1, H4:1, H5:1, H6:1, BLOCKQUOTE:1, FIGURE:1,
    FIGCAPTION:1, IMG:1, HR:1, TABLE:1, THEAD:1, TBODY:1, TR:1, TH:1,
    TD:1, CODE:1, PRE:1, SUP:1, SUB:1, SPAN:1
  };

  /* Neither the blog nor the attorney bios use real heading tags — Divi styles
     plain paragraphs instead, so the structure is lost the moment its classes
     are stripped. Two signals recover it, checked before anything is unwrapped:
       posts write a heading as <p><strong>Heading</strong></p>;
       bios put each heading alone in its own text module. */
  function promoteHeadings(root) {
    /* A heading ending in a colon labels the list right below it, so it sits a
       level under the section heading it falls within. */
    function toHeading(node, text) {
      var h = node.ownerDocument.createElement(/:$/.test(text) ? "h4" : "h3");
      h.textContent = text;
      node.parentNode.replaceChild(h, node);
    }

    Array.prototype.forEach.call(root.querySelectorAll("p"), function (para) {
      var text = para.textContent.replace(/\s+/g, " ").trim();
      if (!text || text.length > 110) return;
      if (para.querySelector("img, br, a")) return;

      var strongs = para.querySelectorAll("strong, b");
      var wholeLineBold =
        strongs.length === 1 &&
        strongs[0].textContent.replace(/\s+/g, " ").trim() === text;

      if (wholeLineBold && !/[.!]$/.test(text)) { toHeading(para, text); return; }

      var mod = para.closest(".et_pb_text_inner");
      if (!mod) return;
      var blocks = Array.prototype.filter.call(mod.children, function (n) {
        return n.textContent.trim() || n.querySelector("img, br");
      });
      if (blocks.length === 1 && blocks[0] === para &&
          text.length <= 90 && !/[.!?,;:]$/.test(text)) {
        toHeading(para, text);
      }
    });
  }

  function sanitize(html) {
    var doc = new DOMParser().parseFromString(
      "<div id='r'>" + (html || "") + "</div>", "text/html"
    );
    var root = doc.getElementById("r");

    root.querySelectorAll("script, style, noscript, iframe, form, input, button")
      .forEach(function (n) { n.remove(); });

    promoteHeadings(root);

    /* Unwrap anything that isn't on the allow-list, keeping its children. */
    var guard = 0;
    while (guard++ < 200) {
      var stray = null;
      var all = root.querySelectorAll("*");
      for (var i = 0; i < all.length; i++) {
        if (!ALLOWED[all[i].tagName]) { stray = all[i]; break; }
      }
      if (!stray) break;
      var parent = stray.parentNode;
      while (stray.firstChild) parent.insertBefore(stray.firstChild, stray);
      parent.removeChild(stray);
    }

    root.querySelectorAll("*").forEach(function (el) {
      Array.prototype.slice.call(el.attributes).forEach(function (attr) {
        var n = attr.name.toLowerCase();
        var keep =
          (el.tagName === "A"   && (n === "href" || n === "title")) ||
          (el.tagName === "IMG" && (n === "src" || n === "alt" ||
                                    n === "width" || n === "height"));
        if (!keep) el.removeAttribute(attr.name);
      });

      if (el.tagName === "A") {
        var href = el.getAttribute("href") || "";
        if (/^\s*javascript:/i.test(href)) el.removeAttribute("href");
        else if (/^https?:/i.test(href)) {
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noopener noreferrer");
        }
      }
      if (el.tagName === "IMG") el.setAttribute("loading", "lazy");
    });

    /* Drop wrappers left holding nothing. */
    root.querySelectorAll("p, span, li").forEach(function (el) {
      if (!el.textContent.trim() && !el.querySelector("img, br")) el.remove();
    });

    return root.innerHTML.trim();
  }

  function stripTags(html) {
    var doc = new DOMParser().parseFromString(html || "", "text/html");
    return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric"
    });
  }

  /* ---------------------------------------------------------- mappers --- */

  function featuredImage(item) {
    var media = item._embedded && item._embedded["wp:featuredmedia"];
    if (!media || !media[0] || media[0].code) return null;
    var m = media[0];
    var sizes = (m.media_details && m.media_details.sizes) || {};
    var pick = sizes.large || sizes.medium_large || sizes.full;
    return { url: (pick && pick.source_url) || m.source_url, alt: m.alt_text || "" };
  }

  /* WordPress stores admissions as one run-on line ("…VA, GARegistered Patent
     Attorney, USPTO"). Insert the separator the source is missing. */
  function tidyBar(text) {
    return (text || "")
      .replace(/\s+/g, " ")
      .replace(/([a-z]{2,})(Registered|Admitted)\b/g, "$1 \u00b7 $2")
      .replace(/\b([A-Z]{2})(Registered|Admitted)\b/g, "$1 \u00b7 $2")
      .trim();
  }

  /* Strip a leading heading that just repeats the title, plus the byline line
     WordPress renders under it — both are laid out by the page template. */
  function liftHeader(root, title) {
    var byline = "", guard = 0;
    while (root.firstElementChild && guard++ < 5) {
      var node = root.firstElementChild;
      var txt = node.textContent.replace(/\s+/g, " ").trim();
      if (!txt) { node.remove(); continue; }

      if (/^H[1-6]$/.test(node.tagName) &&
          txt.toLowerCase() === (title || "").toLowerCase()) {
        node.remove(); continue;
      }
      if (!byline && txt.length <= 120 && /^by\s+/i.test(txt)) {
        byline = txt.split("|")[0].trim(); node.remove(); continue;
      }
      /* Some posts open with a stray date or firm-name line; the page
         template renders both itself. */
      if (txt.length <= 40 &&
          /^[A-Z][a-z]{2,8}\.?\s+\d{1,2},?\s+\d{4}$/.test(txt)) {
        node.remove(); continue;
      }
      if (txt.toLowerCase() === "lex generalis") { node.remove(); continue; }
      break;
    }
    return byline;
  }

  /* Authors come from the PublishPress Authors plugin's `authors` array, not
     WordPress's own `author` field — that one points at a single shared
     account on this site and carries no name. Each entry's display_name is
     already "Name, Title", which is what the blog shows.

     An entry with no space in its name is the site's own account rather than
     a person (the earliest post is filed that way), so it is skipped: better
     to show no byline than to print an account handle. */
  function mapAuthors(p) {
    var list = Array.isArray(p.authors) ? p.authors : [];
    return list
      .map(function (a) { return String((a && a.display_name) || "").trim(); })
      .filter(function (name) { return name && /\s/.test(name); })
      .map(function (name) {
        var at = name.indexOf(",");
        return at === -1
          ? { name: name, role: "" }
          : { name: name.slice(0, at).trim(), role: name.slice(at + 1).trim() };
      });
  }

  function mapPost(p) {
    var title = decodeEntities((p.title && p.title.rendered) || "Untitled");
    var clean = sanitize((p.content && p.content.rendered) || "");

    var doc = new DOMParser().parseFromString(
      "<div id='r'>" + clean + "</div>", "text/html");
    var root = doc.getElementById("r");
    var byline = liftHeader(root, title);

    return {
      id: p.id,
      slug: p.slug,
      title: title,
      date: p.date,
      dateLabel: formatDate(p.date),
      authors: mapAuthors(p),
      byline: byline,
      excerpt: stripTags((p.excerpt && p.excerpt.rendered) || ""),
      content: root.innerHTML.trim(),
      image: featuredImage(p),
      link: p.link
    };
  }

  /* An attorney Page carries the headshot as its first image and repeats the
     name and role as leading headings. Lift those out so the detail page can
     lay them out itself instead of rendering Divi's arrangement. */
  function mapAttorney(p) {
    var name = decodeEntities((p.title && p.title.rendered) || "");
    var clean = sanitize((p.content && p.content.rendered) || "");
    var doc = new DOMParser().parseFromString("<div id='r'>" + clean + "</div>", "text/html");
    var root = doc.getElementById("r");

    var photo = null;
    var firstImg = root.querySelector("img");
    if (firstImg) { photo = firstImg.getAttribute("src"); firstImg.remove(); }

    /* Walk the leading headings: one matching the name, one short line after
       it treated as the role, plus any "Admitted to practice…" line. */
    var role = "", bar = "";
    var guard = 0;
    while (root.firstElementChild && guard++ < 6) {
      var el = root.firstElementChild;
      var txt = el.textContent.replace(/\s+/g, " ").trim();
      if (!txt) { el.remove(); continue; }

      var isHeading = /^H[1-6]$/.test(el.tagName);
      if (isHeading && txt.toLowerCase() === name.toLowerCase()) { el.remove(); continue; }
      if (/^admitted to practice/i.test(txt)) { bar = tidyBar(txt); el.remove(); continue; }
      if (!role && txt.length <= 60 && !/[.]\s/.test(txt)) { role = txt; el.remove(); continue; }
      break;
    }

    var feat = featuredImage(p);
    return {
      id: p.id,
      slug: p.slug,
      name: name,
      role: role,
      bar: bar,
      photo: (feat && feat.url) || photo,
      content: root.innerHTML.trim(),
      link: p.link
    };
  }

  /* ------------------------------------------------------------- API --- */

  var WP = {
    configured: Boolean(BASE),

    getPosts: function (opts) {
      opts = opts || {};
      return request("/posts", {
        page: opts.page || 1,
        per_page: opts.perPage || CFG.postsPerPage || 10,
        search: opts.search,
        _embed: "wp:featuredmedia",
        _fields: "id,slug,date,link,title,excerpt,authors,_links,_embedded"
      }).then(function (r) {
        return {
          posts: r.body.map(mapPost),
          total: r.total,
          totalPages: r.totalPages
        };
      });
    },

    getPostBySlug: function (slug) {
      return request("/posts", {
        slug: slug, per_page: 1, _embed: "wp:featuredmedia"
      }).then(function (r) {
        if (!r.body.length) throw new Error("NOT_FOUND");
        return mapPost(r.body[0]);
      });
    },

    /* Reads a Page (default) or a custom post type, depending on config. */
    getAttorneyBySlug: function (slug) {
      var path = CFG.attorneySource === "cpt"
        ? "/" + (CFG.attorneyCpt || "attorney")
        : "/pages";
      return request(path, { slug: slug, per_page: 1, _embed: "wp:featuredmedia" })
        .then(function (r) {
          if (!r.body.length) throw new Error("NOT_FOUND");
          return mapAttorney(r.body[0]);
        });
    },

    /* Only meaningful when attorneySource is "cpt" — lists every attorney
       straight from WordPress with no local roster file. */
    listAttorneys: function () {
      if (CFG.attorneySource !== "cpt") return Promise.resolve(null);
      return request("/" + (CFG.attorneyCpt || "attorney"), {
        per_page: 50, orderby: "menu_order", order: "asc", _embed: "wp:featuredmedia"
      }).then(function (r) { return r.body.map(mapAttorney); });
    },

    tidyBar: tidyBar,
    stripTags: stripTags,
    formatDate: formatDate,
    decodeEntities: decodeEntities
  };

  global.WP = WP;
})(window);
