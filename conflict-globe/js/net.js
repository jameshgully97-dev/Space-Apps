// Networking helpers. Most public feeds do not send CORS headers, so every
// request is routed through the first route that works for its host:
//   1. a user-configured proxy (e.g. the bundled Cloudflare worker)
//   2. the bundled local server's /proxy endpoint (server.ps1 / server.js)
//   3. a direct browser request
// The working route is remembered per host.

import { settings } from "./settings.js";

let localProxy = null; // null = unknown, true/false once probed
const routeByHost = new Map();

async function hasLocalProxy() {
  if (localProxy !== null) return localProxy;
  try {
    const r = await fetch("/api/health", { cache: "no-store" });
    localProxy = r.ok && (await r.json()).proxy === true;
  } catch {
    localProxy = false;
  }
  return localProxy;
}

function routes(url) {
  const list = [];
  const custom = settings.get("proxyUrl");
  if (custom) list.push({ name: "custom", url: custom.includes("{url}") ? custom.replace("{url}", encodeURIComponent(url)) : custom + encodeURIComponent(url) });
  if (localProxy) list.push({ name: "local", url: "/proxy?url=" + encodeURIComponent(url) });
  // Browsers block http:// from https:// pages, so try https for direct calls.
  list.push({ name: "direct", url: location.protocol === "https:" ? url.replace(/^http:/, "https:") : url });
  return list;
}

/** fetch() that transparently picks a CORS-capable route. */
export async function smartFetch(url, { timeout = 20000, type = "json" } = {}) {
  await hasLocalProxy();
  const host = new URL(url).host;
  let candidates = routes(url);
  const known = routeByHost.get(host);
  if (known) candidates = [...candidates.filter((c) => c.name === known), ...candidates.filter((c) => c.name !== known)];

  let lastErr;
  for (const c of candidates) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(c.url, { signal: ctrl.signal, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      routeByHost.set(host, c.name);
      if (type === "json") return await res.json();
      if (type === "text") return await res.text();
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      lastErr = new Error(`${c.name}: ${e.name === "AbortError" ? "timeout" : e.message}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

export function routeFor(url) {
  return routeByHost.get(new URL(url).host) || "—";
}

/**
 * Minimal ZIP reader: returns the first file of an archive as text.
 * Handles stored and deflate entries via the native DecompressionStream.
 */
export async function unzipFirstFile(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Locate End Of Central Directory record.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a zip archive");
  const cdOffset = dv.getUint32(eocd + 16, true);
  if (dv.getUint32(cdOffset, true) !== 0x02014b50) throw new Error("bad central directory");
  const method = dv.getUint16(cdOffset + 10, true);
  const compSize = dv.getUint32(cdOffset + 20, true);
  const localOff = dv.getUint32(cdOffset + 42, true);
  const nameLen = dv.getUint16(localOff + 26, true);
  const extraLen = dv.getUint16(localOff + 28, true);
  const start = localOff + 30 + nameLen + extraLen;
  const data = bytes.subarray(start, start + compSize);
  if (method === 0) return new TextDecoder().decode(data);
  if (method !== 8) throw new Error("unsupported zip compression " + method);
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return await new Response(stream).text();
}
