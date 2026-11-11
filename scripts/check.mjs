#!/usr/bin/env node
/* Sanity checks for the site — no dependencies, no network.
 *
 *   npm run check
 *
 * Verifies that the scripts parse, that data files are valid JSON, and that
 * every local file referenced by an HTML page actually exists.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const exists = (f) => fs.access(f).then(() => true, () => false);

let failures = 0;
const pass = (m) => console.log(`  ok    ${m}`);
const fail = (m) => { console.log(`  FAIL  ${m}`); failures++; };

const SKIP_DIRS = new Set([".git", "node_modules", "scripts"]);

/* design/ is a local reference page, excluded from the deployment by
   .vercelignore, so the rules about shipped pages do not apply to it. */
const isSitePage = (p) => !p.startsWith("design/");

/* Every .html in the project, as a path relative to the project root. */
async function listHtml(dir = ROOT, prefix = "") {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const found = [];
  for (const e of entries) {
    if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) found.push(...(await listHtml(path.join(dir, e.name), rel)));
    else if (e.name.endsWith(".html")) found.push(rel);
  }
  return found.sort();
}

/* --------------------------------------------------- 1. scripts parse --- */

console.log("\nNo client-side rendering");
{
  const pages = (await listHtml()).filter(isSitePage);
  let scripted = [];
  for (const page of pages) {
    const html = await fs.readFile(path.join(ROOT, page), "utf8");
    /* JSON-LD is data, not code — anything else means text could be arriving
       after load, which is what made the old pages uncrawlable. */
    const tags = [...html.matchAll(/<script([^>]*)>/g)].map((m) => m[1]);
    if (tags.some((t) => !/type=["']application\/ld\+json["']/.test(t))) scripted.push(page);
  }
  scripted.length
    ? fail(`pages still running JavaScript: ${scripted.join(", ")}`)
    : pass(`${pages.length} pages ship no executable JavaScript`);
}

console.log("\nCrawlable text");
{
  const MIN = 120;
  for (const page of (await listHtml()).filter(isSitePage)) {
    if (page === "404.html") continue;
    const raw = await fs.readFile(path.join(ROOT, page), "utf8");
    const body = raw.replace(/<head[\s\S]*?<\/head>/i, "")
                    .replace(/<script[\s\S]*?<\/script>/gi, "")
                    .replace(/<[^>]+>/g, " ");
    const words = body.split(/\s+/).filter(Boolean).length;
    words < MIN
      ? fail(`${page} has only ${words} words of text in the HTML`)
      : pass(`${page} — ${words} words in the HTML`);
  }
}

console.log("\nSearch metadata");
{
  const titles = new Map();
  for (const page of (await listHtml()).filter(isSitePage)) {
    const html = await fs.readFile(path.join(ROOT, page), "utf8");
    const problems = [];
    const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
    if (!title) problems.push("no <title>");
    else {
      if (titles.has(title)) problems.push(`title duplicates ${titles.get(title)}`);
      titles.set(title, page);
    }
    if (!/name="description"/.test(html)) problems.push("no meta description");
    if (page !== "404.html" && !/rel="canonical"/.test(html)) problems.push("no canonical");
    if (page !== "404.html" && !/property="og:title"/.test(html)) problems.push("no Open Graph");
    problems.length ? fail(`${page}: ${problems.join(", ")}`) : pass(`${page} metadata complete`);
  }
}

console.log("\nMarkup validity");
{
  /* A link inside a link is invalid: the parser closes the outer one early and
     pushes the rest out as a sibling, which silently breaks grid layouts. */
  let broken = [];
  for (const page of (await listHtml()).filter(isSitePage)) {
    const html = await fs.readFile(path.join(ROOT, page), "utf8");
    const depth = [];
    let bad = false;
    for (const m of html.matchAll(/<(\/?)a\b/g)) {
      if (m[1]) depth.pop();
      else { if (depth.length) bad = true; depth.push(1); }
    }
    if (bad) broken.push(page);
  }
  broken.length
    ? fail(`nested <a> elements in: ${broken.join(", ")}`)
    : pass("no nested links");
}

console.log("\nCrawler files");
for (const f of ["sitemap.xml", "robots.txt"]) {
  (await exists(path.join(ROOT, f))) ? pass(f) : fail(`${f} missing`);
}

/* ------------------------------------------------------ 2. data files --- */

console.log("\nData");
try {
  const team = JSON.parse(await fs.readFile(path.join(ROOT, "data/team.json"), "utf8"));
  const people = [...(team.legal || []), ...(team.operations || [])];
  if (!people.length) throw new Error("no people listed");

  for (const p of people) {
    for (const field of ["name", "role", "photo"]) {
      if (!p[field]) fail(`data/team.json: "${p.name || "?"}" is missing ${field}`);
    }
    if (p.photo) {
      await fs.access(path.join(ROOT, p.photo))
        .catch(() => fail(`data/team.json: missing photo ${p.photo} (${p.name})`));
    }
  }
  pass(`data/team.json is valid — ${people.length} people`);
} catch (err) {
  fail(`data/team.json: ${err.message}`);
}

/* ------------------------------------------- 3. local references exist --- */

console.log("\nPage references");
const pages = await listHtml();
for (const page of pages) {
  const html = await fs.readFile(path.join(ROOT, page), "utf8");
  const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);

  let missing = 0;
  for (const ref of refs) {
    if (/^(https?:|mailto:|tel:|data:|#|\/\/)/.test(ref)) continue;
    const target = ref.split(/[?#]/)[0];
    if (!target) continue;
    const base = target.startsWith("/")
      ? path.join(ROOT, target)
      : path.resolve(ROOT, path.dirname(page), target);

    /* Links are extensionless because Vercel serves the site with cleanUrls,
       so "/blog" has to resolve to blog.html and "/" to index.html — the
       same way scripts/dev.mjs resolves them locally. */
    const ok = await exists(base)
      || await exists(base + ".html")
      || await exists(path.join(base, "index.html"));
    if (!ok) { fail(`${page} → ${target} does not exist`); missing++; }
  }
  if (!missing) pass(`${page} — ${refs.length} references resolve`);
}

/* ------------------------------------------------ 4. shared furniture --- */

console.log("\nStructure");
for (const page of pages) {
  if (page.startsWith("design/")) { pass(`${page} (design reference, not a site page)`); continue; }
  const html = await fs.readFile(path.join(ROOT, page), "utf8");
  const problems = [];
  if (!/<title>/.test(html)) problems.push("no <title>");
  if (!/class="masthead"/.test(html)) problems.push("no header");
  if (!/class="footer"/.test(html)) problems.push("no footer");
  if (!/name="viewport"/.test(html)) problems.push("no viewport meta");
  problems.length ? fail(`${page}: ${problems.join(", ")}`) : pass(`${page} is well formed`);
}

console.log(
  failures ? `\n${failures} check(s) failed.\n` : `\nAll checks passed.\n`
);
process.exit(failures ? 1 : 0);
