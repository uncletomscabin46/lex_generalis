# Lex Generalis — website

A static marketing site for Lex Generalis. No build step, no framework, no
dependencies: the files in this repository are the files that get served.

```
index.html        Home — hero, About, Services, Team
attorneys.html    Attorneys index
attorney.html     Single attorney profile  (?slug=brandon-fleischman)
blog.html         Blog index, paginated
post.html         Single article          (?slug=…)
assets/css/       Stylesheet
assets/js/        config.js · wp.js (WordPress client) · site.js (page behaviour)
assets/img/       Logo, favicons, headshots, service photography
data/team.json    Team roster
scripts/          dev.mjs (dev server) · check.mjs (sanity checks)
design/fonts.html Typeface comparison — a reference page, not part of the site
```

## Running it locally

```sh
npm run dev
```

Then visit <http://localhost:8001>. The page reloads by itself when you save a
file — edit a stylesheet and the new styles appear without losing your place
on the page.

There is nothing to `npm install`. The dev server is a single file,
`scripts/dev.mjs`, written against Node's standard library, so it works
offline and there is no `node_modules` folder to keep up to date. Node 18 or
newer is required; `.nvmrc` pins the version if you use `nvm`.

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server on port 8001, with live reload |
| `npm run dev -- --port 8080` | Same, on a different port (`PORT=8080 npm run dev` also works). If the port is busy it steps to the next free one — trust the URL it prints |
| `npm run check` | Verify the scripts parse, `team.json` is valid, and every file a page links to exists |
| `npm run build` | Nothing — there is no build step. Kept so the command doesn't fail if a host calls it |

A server is required either way: opening `index.html` straight from the
filesystem will not work, because browsers block `fetch()` on `file://` URLs.
If you would rather not use Node, `python3 -m http.server 8000` also works,
just without live reload.

## Deploying

Upload the whole folder to any static host — Netlify, Cloudflare Pages, GitHub
Pages, S3, or the existing web host. There is nothing to compile.

---

## Can WordPress supply the blog posts and attorneys?

**Yes — and the blog already does.** Every article on `blog.html` is pulled
live from the existing WordPress site at
`https://www.lexgeneralis.com/wp-json/wp/v2/posts` when the page loads.
Publish a post in WordPress and it appears here on the next page load. Nothing
needs to be rebuilt or re-deployed.

Two things had to be true for this to work, and both were verified against the
live site:

1. **The REST API is public.** `wp-json/wp/v2/posts` returns published posts
   over plain HTTPS with no key or login.
2. **Cross-origin requests are allowed.** WordPress returns
   `Access-Control-Allow-Origin` for public GET requests, so a browser on a
   different domain is permitted to read it. This is WordPress's default
   behaviour and no plugin was needed.

### How the content is cleaned up

The site is built with Divi, which wraps everything in layout `<div>`s and
styles plain paragraphs to *look* like headings rather than using real heading
tags. `assets/js/wp.js` therefore does more than fetch JSON:

- strips Divi's wrappers, inline styles and scripts, so content inherits this
  site's typography instead of arriving with the old theme's styling;
- restores heading structure, recognising the two conventions the content
  actually uses — `<p><strong>Heading</strong></p>` in blog posts, and a
  heading sitting alone in its own text module in attorney bios;
- lifts the title, byline and date out of the body so the page template can
  lay them out, rather than showing them twice;
- allows only a safe list of tags through, so nothing from WordPress can
  inject a script into this site.

This was checked against all 9 published posts and all 4 attorney pages.

### Attorneys: how they work today

Attorney bios are already live from WordPress. Brandon Fleischman, Carin
Sears, John Sears and Chiderah Azodoh each have a WordPress **Page**, and
`attorney.html?slug=…` reads that page through the API — bio, headshot, role
and admissions included. Edit the page in WordPress and the profile updates.

The *roster* — who appears in the grid, in what order, with which headshot —
comes from `data/team.json`. That file exists because the team grid on the old
site was hand-assembled in Divi rather than stored as structured data, so
there is no clean API endpoint to read it from. Team members without their own
WordPress page (John Eatman, Chenae Byrd, and the business operations team)
live only in this file.

**To add or change someone now:** edit `data/team.json`. Each entry looks like:

```json
{
  "name": "Jane Attorney",
  "role": "Associate",
  "bar": "Admitted to practice in AZ",
  "photo": "assets/img/team/jane-attorney.jpg",
  "linkedin": "https://www.linkedin.com/in/…",
  "wpSlug": "jane-attorney"
}
```

Set `wpSlug` to the slug of their WordPress page to give them a linked profile,
or `null` if they should appear in the grid without one.

### Making attorneys fully WordPress-managed

To remove `data/team.json` from the loop entirely, register an `attorney`
custom post type in WordPress **with `show_in_rest` enabled** (this flag is
what publishes it to the API — without it the post type stays invisible):

```php
register_post_type('attorney', [
  'label'         => 'Attorneys',
  'public'        => true,
  'show_in_rest'  => true,          // required
  'rest_base'     => 'attorney',
  'supports'      => ['title', 'editor', 'thumbnail', 'page-attributes'],
  'menu_icon'     => 'dashicons-groups',
]);
```

Then set `attorneySource: "cpt"` in `assets/js/config.js`. The site will list
attorneys straight from `/wp-json/wp/v2/attorney`, ordered by the "Order" field
on each entry, and use the featured image as the headshot. The code path for
this is already written — `data/team.json` becomes the fallback used only if
the API is unreachable.

### Pointing at a different WordPress install

Change `wpBase` in `assets/js/config.js`. Nothing else references the domain.

### If the API is unreachable

Every page degrades rather than breaking: the blog shows a short "try again
shortly" message, and the team grid falls back to `data/team.json`. The rest of
each page — which is plain HTML — is unaffected.

---

## Notes on the design

- **Typefaces.** Newsreader for headings and display, Inter for body and
  interface text. The old site used Divi's default Open Sans throughout.

  Eleven pairings were rendered against the real pages and compared. Newsreader
  won on two counts: it holds genuine weight at display sizes, where a Garamond
  goes delicate and starts to blend into body copy, and it is narrow enough
  that long article subheads stay on one line — the wider faces wrapped them.
  It also has optical sizing, so it is drawn differently for a 72px headline
  than for a 17px subhead rather than being scaled.

  The three runners-up are kept in `design/fonts.html`. Open
  <http://localhost:8001/design/fonts.html> with the dev server running and
  click between them to see each one set in the firm's own words:

  | Option | Character |
  | --- | --- |
  | **Newsreader** (in use) | Modern editorial authority |
  | Libre Baskerville | The most traditionally legal — sturdy, American, wider |
  | Source Serif 4 + Source Sans 3 | Institutional and understated |
  | EB Garamond | What the site used before — elegant, but softer hierarchy |

  Each option carries its own size and tracking compensation, because the same
  pixel size looks markedly different across these faces. To switch, copy the
  option's settings into `--display` / `--sans` in `assets/css/style.css` and
  update the Google Fonts `<link>` in the five page files — or just say which
  one you want. `design/fonts.html` is a reference page, not part of the site;
  nothing links to it and it can be deleted.
- **Logo.** The supplied wordmark is white-on-transparent and only worked on a
  dark background. `logo-dark.png` is a navy recolour for the light header;
  `logo-light.png` is the original, trimmed, for the dark footer. Both are
  generated from `logo.png`, which is kept as the source.
- **Favicon.** The wordmark is roughly 14:1 and unreadable at 32px, so the
  favicon is an "LG" monogram instead.
- **Homepage copy** is carried over from the existing site unchanged.
