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
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
const pass = (m) => console.log(`  ok    ${m}`);
const fail = (m) => { console.log(`  FAIL  ${m}`); failures++; };

const SKIP_DIRS = new Set([".git", "node_modules", "scripts"]);

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

console.log("\nBrowser scripts");
for (const name of ["config.js", "wp.js", "site.js"]) {
  const file = path.join(ROOT, "assets/js", name);
  try {
    new vm.Script(await fs.readFile(file, "utf8"), { filename: file });
    pass(`assets/js/${name} parses`);
  } catch (err) {
    fail(`assets/js/${name}: ${err.message}`);
  }
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
    await fs.access(base)
      .catch(() => { fail(`${page} → ${target} does not exist`); missing++; });
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
  if (!/data-page="/.test(html)) problems.push("no data-page attribute");
  problems.length ? fail(`${page}: ${problems.join(", ")}`) : pass(`${page} is well formed`);
}

console.log(
  failures ? `\n${failures} check(s) failed.\n` : `\nAll checks passed.\n`
);
process.exit(failures ? 1 : 0);
