#!/usr/bin/env node
/* Builds the site: every page is written out as real HTML with its text in
 * the file, so a crawler that runs no JavaScript still sees the whole thing.
 *
 *   npm run build
 *
 * Reads content/ and data/team.json, writes HTML into the project root.
 * No dependencies — it runs on a clean checkout with nothing installed.
 *
 * Article and profile URLs deliberately match the paths WordPress used
 * (/patent-term-adjustment-strategies, /brandon-fleischman), so existing
 * links and search rankings survive the move.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SITE = {
  url: "https://www.lexgeneralis.com",
  name: "Lex Generalis",
  email: "info@lexgeneralis.com",
  address: ["5227 N. 7th St., Suite 18056", "Phoenix, AZ 85014"],
  locality: "Phoenix",
  region: "AZ",
  postal: "85014",
  street: "5227 N. 7th St., Suite 18056",
};

const FONTS =
  "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..600;" +
  "1,6..72,400..500&family=Inter:wght@400;500;600&display=swap";

/* ------------------------------------------------------------- helpers --- */

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const stripTags = (html) =>
  String(html ?? "").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "’").replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ").trim();

const summarise = (text, max = 155) => {
  const t = stripTags(text);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ")) + "…";
};

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function readDir(dir) {
  const full = path.join(ROOT, dir);
  let names = [];
  try { names = await fs.readdir(full); } catch { return []; }
  return Promise.all(
    names.filter((n) => n.endsWith(".json")).sort()
      .map((n) => readJson(path.join(full, n)))
  );
}

/* -------------------------------------------------------------- layout --- */

function head({ title, description, canonical, image, type = "website", jsonLd }) {
  const url = SITE.url + canonical;
  const img = image ? (image.startsWith("http") ? image : SITE.url + image) : null;
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${canonical === "/404" ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${esc(url)}">`}
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:type" content="${type}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">${
  img ? `\n<meta property="og:image" content="${esc(img)}">` : ""}
<meta name="twitter:card" content="${img ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">${
  img ? `\n<meta name="twitter:image" content="${esc(img)}">` : ""}
<link rel="icon" type="image/png" sizes="32x32" href="/assets/img/favicon-32.png">
<link rel="icon" type="image/png" sizes="256x256" href="/assets/img/favicon.png">
<link rel="apple-touch-icon" href="/assets/img/favicon-180.png">
<meta name="theme-color" content="#101A2B">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${FONTS}" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/style.css">${
  jsonLd ? `\n<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ""}`;
}

const header = (current) => `<header class="masthead">
  <div class="shell masthead__inner">
    <a class="brand" href="/" aria-label="${esc(SITE.name)} — home">
      <img src="/assets/img/logo-dark.png" alt="${esc(SITE.name)}" width="793" height="54">
    </a>
    <nav class="nav" aria-label="Primary">
      <a href="/attorneys"${current === "attorneys" ? ' aria-current="page"' : ""}>Attorneys</a>
      <a href="/blog"${current === "blog" ? ' aria-current="page"' : ""}>Blog</a>
    </nav>
    <div class="masthead__end">
      <a class="contact-link" href="mailto:${SITE.email}">Contact</a>
    </div>
  </div>
</header>`;

const footer = () => `<footer class="footer">
  <div class="shell">
    <div class="footer__row">
      <p class="footer__copy">&copy; ${new Date().getFullYear()} ${esc(SITE.name)}. All rights reserved.</p>
      <p class="footer__email"><a href="mailto:${SITE.email}">${SITE.email}</a></p>
      <p class="footer__address">${SITE.address[0]}<br>${SITE.address[1]}</p>
    </div>
    <p class="footer__legal">
      <a href="/privacy-policy">Privacy Policy</a>
      <span class="footer__sep" aria-hidden="true">&middot;</span>
      <a href="/terms-of-use">Terms of Use</a>
    </p>
  </div>
</footer>`;

const page = (opts, body) => `<!doctype html>
<html lang="en">
<head>
${head(opts)}
</head>
<body${opts.bodyClass ? ` class="${opts.bodyClass}"` : ""}>

${header(opts.current)}

<main>
${body}
</main>

${footer()}
</body>
</html>
`;

/* ------------------------------------------------------------ fragments --- */

function personCard(p, linked) {
  const inner =
    `<div class="person__frame">${
      p.photo ? `<img src="/${p.photo.replace(/^\//, "")}" alt="${esc(p.name)}" loading="lazy" width="400" height="400">` : ""
    }</div>` +
    `<h3 class="person__name">${esc(p.name)}</h3>` +
    `<p class="person__role">${esc(p.role)}</p>` +
    (p.bar ? `<p class="person__bar">${esc(p.bar)}</p>` : "");

  const links = [];
  if (linked && p.wpSlug) links.push(`<a href="/${p.wpSlug}">Profile</a>`);
  if (p.linkedin) links.push(`<a href="${esc(p.linkedin)}" target="_blank" rel="noopener noreferrer">LinkedIn</a>`);
  const tail = links.length ? `<div class="person__links">${links.join("")}</div>` : "";

  return p.wpSlug && linked
    ? `<a class="person" href="/${p.wpSlug}">${inner}${tail}</a>`
    : `<div class="person">${inner}${tail}</div>`;
}

const grid = (people, linked) =>
  `<div class="grid grid--4">${people.map((p) => personCard(p, linked)).join("")}</div>`;

const bylineHtml = (authors) => {
  if (!authors?.length) return "";
  return `<p class="post-card__byline">${authors.map((a) =>
    `<span class="byline__name">${esc(a.name)}</span>` +
    (a.role ? `<span class="byline__role">, ${esc(a.role)}</span>` : "")
  ).join('<span class="byline__and">and</span>')}</p>`;
};

/* --------------------------------------------------------------- pages --- */

const out = [];
const emit = async (file, html) => {
  const dest = path.join(ROOT, file);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, html);
  out.push({ file, bytes: html.length, words: stripTags(html.replace(/<head[\s\S]*?<\/head>/i, "")).split(/\s+/).length });
};

const home = await readJson(path.join(ROOT, "content/pages/home.json"));
const team = await readJson(path.join(ROOT, "data/team.json"));
const posts = (await readDir("content/posts")).sort((a, b) => (a.date < b.date ? 1 : -1));
const attorneys = await readDir("content/attorneys");
const pages = await readDir("content/pages");

/* The roster is the source of truth for titles; a profile inherits the photo
   from it too, since one WordPress page carries only a placeholder image. */
const roster = [...team.legal, ...team.operations];
const listed = (slug) => roster.find((m) => m.wpSlug === slug) || null;

/* -- home ---------------------------------------------------------------- */
await emit("index.html", page({
  title: home.title,
  description: home.description,
  canonical: "/",
  image: "/assets/img/hero-1200.jpg",
  current: "home",
  jsonLd: {
    "@context": "https://schema.org", "@type": "LegalService",
    name: SITE.name, url: SITE.url, email: SITE.email,
    image: SITE.url + "/assets/img/hero-1200.jpg",
    description: home.description,
    address: {
      "@type": "PostalAddress", streetAddress: SITE.street,
      addressLocality: SITE.locality, addressRegion: SITE.region,
      postalCode: SITE.postal, addressCountry: "US",
    },
    employee: team.legal.map((m) => ({ "@type": "Person", name: m.name, jobTitle: m.role })),
  },
}, `
  <section class="hero hero--photo">
    <div class="shell">
      <div class="hero__mark"></div>
      <h1>${esc(home.heroHeading)}</h1>
      <p class="lede">${esc(home.heroLede)}</p>
      <p style="margin-top:2rem"><a class="btn btn--solid" href="mailto:${SITE.email}">Let&rsquo;s Connect</a></p>
    </div>
  </section>

  <hr class="divider">

  <section class="section" id="about">
    <div class="shell split">
      <div><p class="eyebrow">About</p><h2>${esc(home.aboutHeading)}</h2></div>
      <div class="prose"><p>${esc(home.about)}</p></div>
    </div>
  </section>

  <section class="section section--alt" id="services">
    <div class="shell">
      <p class="eyebrow rule-eyebrow">Services</p>
      <div class="grid grid--3" style="margin-top:2.5rem">
        ${home.services.map((s) => `<article class="service">
          <img class="service__img" src="/${s.image}" alt="" loading="lazy" width="600" height="400">
          <div class="service__body"><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div>
        </article>`).join("")}
      </div>
    </div>
  </section>

  <section class="section" id="team">
    <div class="shell split">
      <div><p class="eyebrow">Team</p><h2>${esc(home.teamHeading)}</h2></div>
      <div class="prose">
        <p>${esc(home.team)}</p>
        <p style="margin-top:1.5rem"><a class="arrow-link" href="/attorneys">Meet the attorneys <span>&rarr;</span></a></p>
      </div>
    </div>
    <div class="shell" style="margin-top:clamp(40px,6vw,72px)">
      <p class="eyebrow rule-eyebrow">Legal Professionals</p>
      <div style="margin-top:2rem">${grid(team.legal, true)}</div>
    </div>
    <div class="shell" style="margin-top:clamp(44px,6vw,76px)">
      <p class="eyebrow rule-eyebrow">Business Operations</p>
      <div style="margin-top:2rem">${grid(team.operations, false)}</div>
    </div>
  </section>
`));

/* -- attorneys index ------------------------------------------------------ */
await emit("attorneys.html", page({
  title: "Attorneys · " + SITE.name,
  description: "The attorneys and professionals of Lex Generalis — investors, entrepreneurs, engineers and scientists who practice law.",
  canonical: "/attorneys",
  current: "attorneys",
}, `
  <section class="hero" style="padding-block:clamp(56px,9vw,104px) clamp(32px,5vw,56px)">
    <div class="shell">
      <div class="hero__mark"></div>
      <h1>Attorneys</h1>
      <p class="lede">Investors, entrepreneurs, engineers, and scientists who practice law &mdash;
        and who have been on the other side of the table.</p>
    </div>
  </section>
  <hr class="divider">
  <section class="section">
    <div class="shell">
      <p class="eyebrow rule-eyebrow">Legal Professionals</p>
      <div style="margin-top:2rem">${grid(team.legal, true)}</div>
    </div>
    <div class="shell" style="margin-top:clamp(44px,6vw,76px)">
      <p class="eyebrow rule-eyebrow">Business Operations</p>
      <div style="margin-top:2rem">${grid(team.operations, false)}</div>
    </div>
  </section>
  <section class="section section--tight section--ink">
    <div class="shell" style="text-align:center">
      <h2>Work with our team.</h2>
      <p class="lede" style="max-width:52ch;margin:0 auto 2rem;color:#C3CAD6">We&rsquo;d like to hear what you&rsquo;re building.</p>
      <a class="btn btn--light" href="mailto:${SITE.email}">${SITE.email}</a>
    </div>
  </section>
`));

/* -- attorney profiles ---------------------------------------------------- */
for (const a of attorneys) {
  const m = listed(a.slug);
  const role = m?.role || a.role;
  const bar = m?.bar || a.bar;
  const photo = m?.photo ? "/" + m.photo : a.photo;
  await emit(`${a.slug}.html`, page({
    title: `${a.name} · ${SITE.name}`,
    description: summarise(`${a.name}, ${role}. ${stripTags(a.html)}`),
    canonical: `/${a.slug}`,
    image: photo,
    type: "profile",
    current: "attorneys",
    jsonLd: {
      "@context": "https://schema.org", "@type": "Person",
      name: a.name, jobTitle: role, url: `${SITE.url}/${a.slug}`,
      image: photo && (photo.startsWith("http") ? photo : SITE.url + photo),
      worksFor: { "@type": "LegalService", name: SITE.name, url: SITE.url },
    },
  }, `
  <section class="section" style="padding-top:clamp(40px,6vw,72px)">
    <div class="shell">
      <p style="margin-bottom:2rem"><a class="arrow-link arrow-link--back" href="/attorneys"><span>&larr;</span> All attorneys</a></p>
      <div class="bio-layout">
        <aside class="bio-aside">
          ${photo ? `<img src="${esc(photo)}" alt="${esc(a.name)}" width="400" height="400">` : ""}
          <h1 style="font-size:clamp(1.9rem,3.4vw,2.4rem)">${esc(a.name)}</h1>
          ${role ? `<p class="person__role">${esc(role)}</p>` : ""}
          ${bar ? `<p class="person__bar">${esc(bar)}</p>` : ""}
        </aside>
        <div class="prose">${a.html}</div>
      </div>
    </div>
  </section>
`));
}

/* -- blog index ----------------------------------------------------------- */
await emit("blog.html", page({
  title: "Blog · " + SITE.name,
  description: "Writing from the attorneys of Lex Generalis on corporate law, venture financing and intellectual property.",
  canonical: "/blog",
  current: "blog",
  jsonLd: {
    "@context": "https://schema.org", "@type": "Blog",
    name: `${SITE.name} Blog`, url: `${SITE.url}/blog`,
    blogPost: posts.map((p) => ({
      "@type": "BlogPosting", headline: p.title,
      url: `${SITE.url}/${p.slug}`, datePublished: p.date,
      author: p.authors.map((a) => ({ "@type": "Person", name: a.name })),
    })),
  },
}, `
  <section class="hero" style="padding-block:clamp(56px,9vw,104px) clamp(32px,5vw,56px)">
    <div class="shell"><div class="hero__mark"></div><h1>Blog</h1></div>
  </section>
  <hr class="divider">
  <section class="section">
    <div class="shell" style="max-width:860px">
      ${posts.map((p) => `<a class="post-card" href="/${p.slug}">
        <p class="post-card__meta">${esc(p.dateLabel)}</p>
        <h2 class="post-card__title">${esc(p.title)}</h2>
        <div class="post-card__excerpt"><p>${esc(p.excerpt)}</p></div>
        ${bylineHtml(p.authors)}
      </a>`).join("")}
    </div>
  </section>
`));

/* -- articles ------------------------------------------------------------- */
for (const p of posts) {
  const who = p.authors.map((a) => (a.role ? `${a.name}, ${a.role}` : a.name)).join(" and ");
  await emit(`${p.slug}.html`, page({
    title: `${p.title} · ${SITE.name}`,
    description: summarise(p.excerpt || p.html),
    canonical: `/${p.slug}`,
    image: p.image?.url || "/assets/img/hero-1200.jpg",
    type: "article",
    current: "blog",
    jsonLd: {
      "@context": "https://schema.org", "@type": "BlogPosting",
      headline: p.title, datePublished: p.date, dateModified: p.date,
      url: `${SITE.url}/${p.slug}`,
      mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE.url}/${p.slug}` },
      author: p.authors.length
        ? p.authors.map((a) => ({ "@type": "Person", name: a.name, jobTitle: a.role || undefined }))
        : { "@type": "Organization", name: SITE.name },
      publisher: { "@type": "Organization", name: SITE.name, url: SITE.url },
      description: summarise(p.excerpt || p.html),
    },
  }, `
  <article>
    <header class="article-head">
      <div class="shell">
        <p class="article-meta">${esc(p.dateLabel)}${who ? " · " + esc(who) : ""}</p>
        <h1>${esc(p.title)}</h1>
      </div>
    </header>
    <div class="shell">
      <div class="prose prose--center" style="padding-bottom:clamp(48px,7vw,88px)">
        ${p.image ? `<img src="${esc(p.image.url)}" alt="${esc(p.image.alt || p.title)}">` : ""}
        ${p.html}
      </div>
      <p style="max-width:68ch;margin:0 auto;padding-bottom:clamp(48px,7vw,88px)">
        <a class="arrow-link arrow-link--back" href="/blog"><span>&larr;</span> All articles</a>
      </p>
    </div>
  </article>
`));
}

/* -- legal pages ---------------------------------------------------------- */
for (const pg of pages.filter((x) => x.slug && x.html)) {
  await emit(`${pg.slug}.html`, page({
    title: `${pg.title} · ${SITE.name}`,
    description: summarise(pg.html),
    canonical: `/${pg.slug}`,
  }, `
  <section class="section" style="padding-top:clamp(40px,6vw,72px)">
    <div class="shell">
      <h1 style="max-width:24ch">${esc(pg.title)}</h1>
      <div class="prose" style="margin-top:2rem">${pg.html}</div>
    </div>
  </section>
`));
}

/* -- not found ------------------------------------------------------------ */
await emit("404.html", page({
  title: "Page not found \u00b7 " + SITE.name,
  description: "The page you were looking for could not be found.",
  canonical: "/404",
}, `
  <section class="hero" style="padding-block:clamp(72px,11vw,140px) clamp(56px,8vw,96px)">
    <div class="shell">
      <div class="hero__mark"></div>
      <p class="eyebrow" style="justify-content:center">Error 404</p>
      <h1 style="max-width:20ch">This page could not be found.</h1>
      <p class="lede" style="max-width:52ch;margin-inline:auto">The link may be out of date, or the page may have moved.</p>
      <p style="margin-top:2rem"><a class="btn btn--solid" href="/">Back to the home page</a></p>
      <p style="margin-top:1.5rem"><a class="arrow-link" href="/blog">Read the blog <span>&rarr;</span></a></p>
    </div>
  </section>
`));

/* -- sitemap and robots --------------------------------------------------- */
const urls = [
  { loc: "/", priority: "1.0", changefreq: "monthly" },
  { loc: "/attorneys", priority: "0.9", changefreq: "monthly" },
  { loc: "/blog", priority: "0.9", changefreq: "weekly" },
  ...attorneys.map((a) => ({ loc: `/${a.slug}`, priority: "0.8", changefreq: "monthly" })),
  ...posts.map((p) => ({ loc: `/${p.slug}`, priority: "0.7", changefreq: "yearly", lastmod: p.date.slice(0, 10) })),
  ...pages.map((p) => ({ loc: `/${p.slug}`, priority: "0.3", changefreq: "yearly" })),
];
await emit("sitemap.xml",
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${SITE.url}${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ""}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join("\n")}
</urlset>
`);
await emit("robots.txt",
`User-agent: *
Allow: /

Sitemap: ${SITE.url}/sitemap.xml
`);

/* ---------------------------------------------------------------- report --- */
const thin = out.filter((o) => o.file.endsWith(".html") && o.words < 120 && o.file !== "404.html");
console.log(`Built ${out.length} files\n`);
for (const o of out.filter((o) => o.file.endsWith(".html")).slice(0, 6)) {
  console.log(`  ${o.file.padEnd(62)} ${String(o.words).padStart(5)} words`);
}
console.log(`  … ${out.filter((o) => o.file.endsWith(".html")).length - 6} more HTML pages`);
console.log(`\n  sitemap.xml: ${urls.length} URLs`);
console.log(thin.length
  ? `\n  WARNING — pages with little text: ${thin.map((t) => t.file).join(", ")}`
  : `\n  Every generated page carries its text in the HTML.`);
