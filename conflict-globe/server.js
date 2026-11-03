#!/usr/bin/env node
// Conflict Globe - cross-platform local server (Node 18+, no dependencies).
// Same behaviour as server.ps1: static files + allow-listed /proxy endpoint.
//   node server.js [port]
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 8787);
const ALLOWED = new Set(["data.gdeltproject.org", "api.gdeltproject.org", "api.adsb.lol", "api.airplanes.live"]);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".txt": "text/plain" };
const cache = new Map();

function send(res, status, type, body) {
  res.writeHead(status, { "Content-Type": type, "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache" });
  res.end(body);
}

async function proxy(res, target) {
  let u;
  try { u = new URL(target); } catch { return send(res, 400, "text/plain", "bad url"); }
  if (!ALLOWED.has(u.host)) return send(res, 403, "text/plain", `host not allowed: ${u.host}`);
  const ttl = target.endsWith(".zip") ? 3600e3 : target.includes("lastupdate") ? 60e3 : 2e3;
  const hit = cache.get(target);
  if (hit && Date.now() - hit.at < ttl) return send(res, 200, hit.type, hit.body);
  try {
    const r = await fetch(target, { headers: { "User-Agent": "ConflictGlobe/1.0 (+local)" }, signal: AbortSignal.timeout(30000) });
    const body = Buffer.from(await r.arrayBuffer());
    const type = r.headers.get("content-type") || "application/octet-stream";
    if (r.ok) {
      if (cache.size > 200) cache.clear();
      cache.set(target, { at: Date.now(), type, body });
    }
    send(res, r.status, type, body);
  } catch (e) {
    send(res, 502, "text/plain", `upstream error: ${e.message}`);
  }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/health") return send(res, 200, "application/json", '{"ok":true,"proxy":true}');
  if (url.pathname === "/proxy") return proxy(res, url.searchParams.get("url") || "");
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
  const file = normalize(join(ROOT, rel));
  if (!file.startsWith(normalize(ROOT + sep)) && file !== normalize(ROOT)) return send(res, 404, "text/plain", "not found");
  try {
    if (!(await stat(file)).isFile()) throw new Error();
    send(res, 200, MIME[extname(file).toLowerCase()] || "application/octet-stream", await readFile(file));
  } catch {
    send(res, 404, "text/plain", "not found");
  }
}).listen(PORT, "127.0.0.1", () => console.log(`Conflict Globe running at http://localhost:${PORT}/`));
