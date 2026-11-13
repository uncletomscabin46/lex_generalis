# Lex Generalis — website

A static site for Lex Generalis. Every page is generated as real HTML with its
text in the file, so search engines and link-preview bots see the whole page
without running any JavaScript. The site ships **no client-side JavaScript at
all** and makes **no requests to WordPress** — it is entirely self-contained.

```
content/            The site's text — the source of truth
  posts/*.json        blog articles
  attorneys/*.json    profiles
  pages/*.json        home copy, privacy policy, terms of use
data/team.json      The team roster: names, titles, photos, ordering
assets/             Stylesheet, images, fonts
scripts/
  build.mjs           generates every page — no dependencies
  check.mjs           verifies the output
  dev.mjs             local server with live reload
  import-wordpress.mjs  the one-time migration out of WordPress
  lib/                wp.js + config.js, used only by the importer
*.html              Generated — do not edit by hand; edit content/ and rebuild
sitemap.xml         Generated
```

## Editing the site

Everything lives in `content/` and `data/team.json`. Edit the JSON, run
`npm run build`, commit. Nothing else needs touching.

| To change | Edit |
| --- | --- |
| A blog article | `content/posts/<slug>.json` |
| An attorney profile | `content/attorneys/<slug>.json` |
| Home page copy | `content/pages/home.json` |
| Privacy policy / terms | `content/pages/*.json` |
| Who is on the team, their titles, order | `data/team.json` |

A new article is a new file in `content/posts/`, following the shape of the
existing ones. Its `slug` becomes its URL.

## Why it is built this way

The site used to fetch the blog and the profiles from the WordPress API in the
browser. That had two problems.

**Search engines saw almost nothing.** The HTML held a header and a footer; the
text arrived afterwards, from JavaScript. An article page served 29 words.
Google does run JavaScript, but on a slower, less reliable second pass, and
LinkedIn and Slack link previews do not run it at all. Every article also
shared one title — "Article · Lex Generalis" — because the real title was set
by script after load.

**And it depended on WordPress staying up.** Switching WordPress off would have
left the blog and every profile permanently blank.

Generating the pages ahead of time fixes both. Articles now serve 567–4,573
words of real text, every page has its own title, description, canonical URL,
Open Graph tags and structured data, and there is a sitemap.

## Running it locally

```sh
npm run dev
```

Builds the site, then serves it at <http://localhost:8001>. Use `npm run serve`
to skip the rebuild, and `npm run build` to rebuild without serving. The page reloads by itself when you save a
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

## Migrating off WordPress

`scripts/import-wordpress.mjs` pulled everything across: 10 articles, 5
profiles, the privacy policy and the terms of use, plus the images they
reference. It has already been run and its output is committed, so WordPress
can be switched off.

It is kept for reference only. Re-running it needs `npm i -D jsdom` — that is
deliberately not a project dependency, so deploys install nothing.

**URLs were preserved exactly.** Articles stay at `/patent-term-adjustment-strategies`
and profiles at `/brandon-fleischman`, the paths WordPress used, so existing
links and search rankings carry over. Requests with WordPress's trailing slash
redirect to the same page.

**Before switching WordPress off**, point the domain at Vercel first and
confirm the pages load. Once DNS moves, the old site is unreachable.

## Deploying to Vercel

The repository is configured for Vercel. Import it at
<https://vercel.com/new>, pick this repo, and deploy — every setting Vercel
asks for is already answered by `vercel.json`:

- **Framework preset:** Other. There is no build step, so `outputDirectory`
  is the repository root and the files are served exactly as they sit here.
- **Clean URLs** are on, so pages are served as `/blog` and `/attorneys`
  rather than `/blog.html`. Internal links are written that way already, so
  navigation never takes a redirect hop. Turn this off by setting
  `cleanUrls` to `false` — the `.html` paths keep working either way.
- **`404.html`** is served for unknown paths.
- **`.vercelignore`** keeps local-only material out of the deployment:
  `scripts/`, `design/`, `content/`, `node_modules/` and this README.

Pushing to `main` deploys to production; any other branch gets a preview URL.

### Headers

`vercel.json` sets security headers on every response, including a Content
Security Policy. The policy matters here because the site injects HTML that
comes from WordPress: `script-src 'self'` means that even if something
unexpected made it through the sanitiser in `wp.js`, the browser will not run
it. The policy allows Google Fonts for styles and fonts, and
`www.lexgeneralis.com` for API calls.

It was verified by serving the site locally through these exact headers and
loading every page — no violations, fonts loading, WordPress content loading.
If you add an embed, an analytics tag or an inline `<script>`, expect the CSP
to block it until you add that source to the policy.

Caching is deliberately short (an hour for assets, five minutes for
`data/team.json`, revalidate-always for HTML). Filenames are not
content-hashed — `hero-1920.webp` keeps its name when you replace the
photograph — so a long cache would leave visitors on a stale image. If you
want aggressive caching later, add a version to the filenames first.

## Deploying anywhere else

Nothing about the site is Vercel-specific: it is plain files. Upload the
folder to Netlify, Cloudflare Pages, GitHub Pages, S3, or the existing web
host. Only `vercel.json` would need translating, and only for the clean URLs
and headers.

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
- **Contact.** The Contact link opens a mail client
  (`mailto:info@lexgeneralis.com`). A real form is planned using a Vercel
  Serverless Function plus Resend, to be implemented by the web development
  team. Note that a plain `<form method="post" action="/api/contact">` submits
  natively, so a form needs no client-side JavaScript; `form-action 'self'` is
  already allowed by the CSP. Whatever handles it will need spam protection —
  a honeypot field at minimum.

- **Mobile navigation.** Below 620px the horizontal nav is replaced by a menu
  button. It is built on `<details>`/`<summary>`, a native disclosure widget,
  so it opens and closes and is keyboard and screen-reader accessible without
  any JavaScript — the site still ships none. The bars fold into a cross when
  open.

  Only one navigation is ever visible: above 620px the inline nav and the
  right-hand Contact link, below it the menu. Taking the links out of the top
  row is also what lets the wordmark be legible on a phone — at ~15:1 it was
  being squeezed to 10px tall beside the nav, and is now 168–208px wide.

  One limitation of the no-JavaScript approach: the menu does not close when
  you tap elsewhere on the page. Tapping the button again closes it.

- **Team headshots.** Every portrait sits on white. Some of the source images
  were cut-outs saved with a transparent background, which let the section
  colour show through — so those sat on ivory while the studio shots sat on
  white. `scripts/normalize-headshots.py` composites any transparent portrait
  onto white (run it with no arguments for a report, `--write` to apply), and
  `.person__frame` is white so the same mismatch cannot reappear.

  The same script also trims dark hairlines off a portrait's edges. One photo
  carried a single black pixel column down its right side and another along
  the bottom, left over from however it was exported; scaled into the square
  frame that read as a stray line beside the portrait. It only ever removes up
  to four lines per edge, so it cannot eat into the picture itself.

  A portrait photographed against a real background cannot be fixed this way
  and needs re-shooting or cutting out; the script reports those rather than
  mangling them.

- **Titles on bio pages.** `data/team.json` is the source of truth for job
  titles. Where a WordPress bio page disagrees with it, the roster wins — the
  same person showing two different titles on one site reads as a mistake.
  Changing someone's title means editing `data/team.json`; the bio page
  follows.

- **Bullet lists in bios.** WordPress wraps several of the bio lists in a list
  item that holds nothing but the list itself (`<ul><li><ul><li>…`). The empty
  outer item still draws a bullet, which showed as a stray marker above an
  indented list. `flattenLists` in `wp.js` lifts the inner items up a level
  and drops the empty rung. A parent that has text of its own is a real
  sub-list and is left nested.

- **Blog bylines.** Author names and titles come from the `authors` field that
  the PublishPress Authors plugin adds to every post — not WordPress's own
  `author` field, which points at one shared account here and carries no name.
  Each entry's `display_name` is already in "Name, Title" form.

  An author whose name has no space in it is treated as the site's own account
  rather than a person and is skipped, so a post filed that way shows no byline
  instead of printing an account handle. Setting a real author on that post in
  WordPress makes the byline appear with no code change.

- **Hero image.** The Supreme Court photograph is carried over from the
  original site, where it was the first section's parallax background. It is
  served at two widths in WebP with JPEG fallbacks, and the untouched original
  is kept as `assets/img/hero-source.jpg`.

  It sits under an ivory scrim that resolves to solid `--paper` at the bottom,
  so the hero still reads as part of the light palette and hands off to the
  next section with no seam. The hero lede uses a darker slate than `--muted`:
  measured against the lightest stonework, `--muted` came to about 4.3:1,
  under the 4.5:1 this text size needs. The replacement measures 6.1:1.

  The photo is on the home page only, via the `hero--photo` class. Add that
  class to any other `.hero` to extend it — interior pages currently request
  no hero image at all.

  **To swap in a different photograph:**

  ```sh
  python3 scripts/make-hero.py path/to/new-photo.jpg
  ```

  That regenerates all four derivatives plus the kept original, under the
  names the stylesheet already references, so no code change is needed.
  One thing usually does need a look afterwards: `background-position` in
  the `.hero--photo::before` rule is currently `62% 42%` (and `70% 52%` on
  narrow screens) because this photo's subject sits right of centre. A
  different composition will want a different value. The scrim is also
  weighted for a bright image — a darker photo may need less of it, and the
  contrast figures above are worth re-checking if you change it.

- **Header.** Opaque at the very top, fading to fully transparent at its lower
  edge, so the hero photograph runs up underneath it. Both the tint and the
  blur sit on a masked pseudo-element: `backdrop-filter` applies evenly across
  its whole box, so without a matching mask the blur would stop on a hard line
  exactly where the tint had faded to nothing.

- **Footer.** Copyright left, email centred, address right, with Privacy Policy
  and Terms of Use centred beneath. The outer columns are equal-width (`1fr auto
  1fr`) so the email sits on the true centre of the page rather than midway
  between its neighbours. Below 720px the three stack and centre, with the
  email first and the copyright last.
- **Homepage copy** is carried over from the existing site unchanged.
