#!/usr/bin/env node
/* Development server for the Lex Generalis site.
 *
 * Serves the folder over HTTP and reloads open browser tabs when a file
 * changes. Uses only Node's standard library — nothing to install, and it
 * keeps working offline.
 *
 *   npm run dev              → http://localhost:8001
 *   npm run dev -- --port 8080   (or PORT=8080 npm run dev)
 */

import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RELOAD_PATH = "/__dev/reload";

/* ----------------------------------------------------------- arguments --- */

function readPort() {
  const args = process.argv.slice(2);
  const i = args.findIndex((a) => a === "--port" || a === "-p");
  const raw =
    (i !== -1 && args[i + 1]) ||
    args.find((a) => a.startsWith("--port="))?.split("=")[1] ||
    process.env.PORT ||
    "8001";
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`Invalid port: ${raw}`);
    process.exit(1);
  }
  return port;
}

/* ---------------------------------------------------------- mime types --- */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

/* --------------------------------------------------------- live reload --- */

const clients = new Set();

/* Injected into every HTML page. A CSS edit swaps the stylesheet in place so
   the page keeps its scroll position; anything else reloads. */
const RELOAD_SNIPPET = `
<script>
(function () {
  var source = new EventSource(${JSON.stringify(RELOAD_PATH)});
  source.addEventListener("css", function () {
    document.querySelectorAll('link[rel="stylesheet"]').forEach(function (link) {
      var url = new URL(link.href, location.href);
      url.searchParams.set("_dev", Date.now());
      link.href = url.pathname + url.search;
    });
  });
  source.addEventListener("reload", function () { location.reload(); });
})();
</script>
`;

let pending = null;
function notify(event, file) {
  clearTimeout(pending);
  pending = setTimeout(() => {
    const rel = path.relative(ROOT, file) || "(unknown)";
    console.log(`  changed  ${rel} → ${event === "css" ? "restyled" : "reloaded"}`);
    for (const res of clients) res.write(`event: ${event}\ndata: 1\n\n`);
  }, 60);
}

function watch() {
  const IGNORED = new Set([".git", "node_modules", ".DS_Store"]);
  try {
    fs.watch(ROOT, { recursive: true }, (_type, name) => {
      if (!name) return;
      const parts = name.split(path.sep);
      if (parts.some((p) => IGNORED.has(p))) return;
      if (name.endsWith("~") || name.startsWith(".")) return;
      notify(name.endsWith(".css") ? "css" : "reload", path.join(ROOT, name));
    });
  } catch {
    console.log("  (file watching unavailable — reload the page manually)");
  }
}

/* ----------------------------------------------------------- resolving --- */

async function resolve(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const target = path.join(ROOT, path.normalize(decoded));

  /* Never serve anything outside the project folder. */
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return null;

  let stat = await fsp.stat(target).catch(() => null);
  if (stat?.isDirectory()) {
    const index = path.join(target, "index.html");
    stat = await fsp.stat(index).catch(() => null);
    return stat?.isFile() ? index : null;
  }
  if (stat?.isFile()) return target;

  /* Allow "/blog" as a shorthand for "/blog.html". */
  const withExt = target + ".html";
  stat = await fsp.stat(withExt).catch(() => null);
  return stat?.isFile() ? withExt : null;
}

/* ------------------------------------------------------------- server --- */

const server = http.createServer(async (req, res) => {
  const url = req.url || "/";

  if (url.split("?")[0] === RELOAD_PATH) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("retry: 1000\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  const file = await resolve(url);

  if (!file) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      `<!doctype html><meta charset="utf-8">` +
        `<title>404</title>` +
        `<body style="font:16px/1.6 -apple-system,sans-serif;padding:48px;max-width:40em">` +
        `<h1>404 — not found</h1><p><code>${url.replace(/[<&]/g, "")}</code> ` +
        `does not exist in this folder.</p><p><a href="/">Back to the home page</a></p>`
    );
    console.log(`  404      ${url}`);
    return;
  }

  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";

  if (ext === ".html") {
    let html = await fsp.readFile(file, "utf8");
    html = html.includes("</body>")
      ? html.replace("</body>", RELOAD_SNIPPET + "</body>")
      : html + RELOAD_SNIPPET;
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(html);
    return;
  }

  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
});

/* If the port is busy, step forward rather than crashing. */
function listen(port, attempt = 0) {
  server.once("error", (err) => {
    if (err.code === "EADDRINUSE" && attempt < 10) {
      console.log(`  port ${port} is in use, trying ${port + 1}…`);
      listen(port + 1, attempt + 1);
      return;
    }
    console.error(err.message);
    process.exit(1);
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`\n  Lex Generalis — dev server`);
    console.log(`  http://localhost:${port}\n`);
    console.log(`  Serving ${ROOT}`);
    console.log(`  Watching for changes. Press Ctrl+C to stop.\n`);
    watch();
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    for (const res of clients) res.end();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 200).unref();
  });
}

listen(readPort());
