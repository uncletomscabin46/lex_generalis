#!/usr/bin/env node
/* One-time import of everything out of WordPress and into this repository.
 *
 *   npm i -D jsdom && node scripts/import-wordpress.mjs
 *
 * Writes content/posts/*.json, content/attorneys/*.json and
 * content/pages/*.json, and downloads any images the content references into
 * assets/img/content/. After this runs the site has no dependency on
 * WordPress at all; the API is never contacted again.
 *
 * jsdom is needed only here, so it is deliberately not a dependency of the
 * project — the build that runs on every deploy needs nothing installed.
 */

import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const ATTORNEY_SLUGS = [
  "brandon-fleischman", "carin-sears", "john-sears",
  "chiderah-azodoh", "john-eatman",
];
const PAGE_SLUGS = ["privacy-policy", "terms-of-use"];

let JSDOM;
try {
  ({ JSDOM } = await import("jsdom"));
} catch {
  console.error("jsdom is required for the import:  npm i -D jsdom");
  process.exit(1);
}

/* Reuse the existing sanitiser rather than reimplementing it — the Divi
   clean-up, heading recovery and list flattening all live in wp.js. */
const dom = new JSDOM("<!doctype html><body></body>", { url: "https://lexgeneralis.com/" });
const win = dom.window;
win.fetch = (url, opts) =>
  fetch(url, { ...opts, headers: { ...((opts && opts.headers) || {}), "User-Agent": UA } });
const ctx = vm.createContext(win);
vm.runInContext(await fs.readFile(path.join(ROOT, "scripts/lib/config.js"), "utf8"), ctx);
vm.runInContext(await fs.readFile(path.join(ROOT, "scripts/lib/wp.js"), "utf8"), ctx);
const WP = win.WP;

const write = async (file, data) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n");
};

/* ---------------------------------------------------------------- images --- */

const IMG_DIR = path.join(ROOT, "assets", "img", "content");
const downloaded = new Map();

async function localise(html) {
  if (!html) return html;
  const urls = [...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  for (const url of new Set(urls)) {
    if (!downloaded.has(url)) {
      const name = decodeURIComponent(url.split("/").pop().split("?")[0])
        .replace(/[^A-Za-z0-9._-]/g, "-");
      try {
        const res = await fetch(url, { headers: { "User-Agent": UA } });
        if (!res.ok) throw new Error(String(res.status));
        await fs.mkdir(IMG_DIR, { recursive: true });
        await fs.writeFile(path.join(IMG_DIR, name), Buffer.from(await res.arrayBuffer()));
        downloaded.set(url, `/assets/img/content/${name}`);
        console.log(`    image  ${name}`);
      } catch (err) {
        console.log(`    image  FAILED ${url} (${err.message}) — left pointing at WordPress`);
        downloaded.set(url, url);
      }
    }
    html = html.split(url).join(downloaded.get(url));
  }
  return html;
}

/* ----------------------------------------------------------------- posts --- */

console.log("Posts");
const { posts } = await WP.getPosts({ page: 1, perPage: 100 });
for (const listed of posts) {
  /* getPosts asks only for excerpts — the body has to be fetched per post. */
  const p = await WP.getPostBySlug(listed.slug);
  p.authors = listed.authors;
  const html = await localise(p.content);
  if (!html) { console.log(`  ${p.slug}: EMPTY BODY — skipped`); continue; }
  const image = p.image ? { url: (await localise(`src="${p.image.url}"`)).slice(5, -1), alt: p.image.alt } : null;
  await write(path.join(ROOT, "content", "posts", `${p.slug}.json`), {
    slug: p.slug,
    title: p.title,
    date: p.date,
    dateLabel: p.dateLabel,
    authors: p.authors,
    excerpt: p.excerpt,
    image,
    html,
  });
  const who = p.authors.map((a) => a.name).join(", ") || "—";
  console.log(`  ${p.slug}\n    ${p.dateLabel} · ${who} · ${html.length} chars`);
}

/* ------------------------------------------------------------- attorneys --- */

console.log("\nAttorneys");
for (const slug of ATTORNEY_SLUGS) {
  try {
    const a = await WP.getAttorneyBySlug(slug);
    const html = await localise(a.content);
    let photo = a.photo;
    if (photo) photo = (await localise(`src="${photo}"`)).slice(5, -1);
    await write(path.join(ROOT, "content", "attorneys", `${slug}.json`), {
      slug, name: a.name, role: a.role, bar: a.bar, photo, html,
    });
    console.log(`  ${slug}\n    ${a.name} · ${a.role || "—"} · ${html.length} chars`);
  } catch (err) {
    console.log(`  ${slug}: FAILED (${err.message})`);
  }
}

/* ----------------------------------------------------------------- pages --- */

console.log("\nPages");
for (const slug of PAGE_SLUGS) {
  const res = await win.fetch(
    `https://www.lexgeneralis.com/wp-json/wp/v2/pages?slug=${slug}&_fields=slug,title,content`
  );
  const [page] = await res.json();
  if (!page) { console.log(`  ${slug}: not found`); continue; }
  const html = await localise(WP.sanitize(page.content.rendered));
  await write(path.join(ROOT, "content", "pages", `${slug}.json`), {
    slug, title: WP.decodeEntities(page.title.rendered), html,
  });
  console.log(`  ${slug}\n    ${html.length} chars`);
}

console.log("\nImport complete. WordPress is no longer needed to serve the site.");
