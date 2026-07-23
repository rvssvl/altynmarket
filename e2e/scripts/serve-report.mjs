// Serves e2e/local-report at http://localhost:4499 and opens the browser.
// file:// would mostly work, but Playwright trace viewing needs HTTP.
// Safe to run repeatedly: if the port is taken, it just opens the URL.
import { spawnSync } from "node:child_process";
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)), "local-report");
const PORT = 4499;
const url = `http://localhost:${PORT}/`;

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".zip": "application/zip",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

const openBrowser = () => {
  if (process.platform === "darwin") spawnSync("open", [url]);
  else console.log(`Report: ${url}`);
};

if (!existsSync(path.join(root, "index.html"))) {
  console.error("No local report yet — run: pnpm --filter @altyn-market/e2e local");
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const requested = decodeURIComponent(new URL(req.url, url).pathname);
  let file = path.normalize(path.join(root, requested));
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) {
    const index = path.join(file, "index.html");
    if (existsSync(index)) {
      file = index;
    } else {
      // Bare listing for artifact folders (screenshots, logs, recordings).
      const entries = readdirSync(file)
        .map((name) => `<li><a href="${path.posix.join(requested, name)}">${name}</a></li>`)
        .join("");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`<h3>${requested}</h3><ul>${entries}</ul>`);
      return;
    }
  }
  if (!existsSync(file)) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, {
    "content-type": types[path.extname(file)] ?? "application/octet-stream",
  });
  createReadStream(file).pipe(res);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    // A previous run's server is still alive — reuse it.
    openBrowser();
    process.exit(0);
  }
  throw error;
});

server.listen(PORT, () => {
  console.log(`Serving local e2e report at ${url}`);
  openBrowser();
});
