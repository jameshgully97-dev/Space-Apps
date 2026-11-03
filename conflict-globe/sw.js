// Service worker: makes the app installable (Edge → "Install Conflict Globe")
// and caches the app shell + Cesium library. Live data is never cached.
const VERSION = "cg-v5";
const SHELL = ["./", "index.html", "css/app.css", "js/main.js", "js/config.js", "js/net.js", "js/settings.js", "js/sprites.js",
  "js/feeds/gdelt.js", "js/feeds/adsb.js", "js/feeds/demo.js", "js/layers/events.js", "js/layers/units.js", "js/layers/aircraft.js", "js/layers/radio.js",
  "js/feeds/pskreporter.js", "js/feeds/verify.js", "js/uniforms.js", "js/ghostnet/plan.js",
  "manifest.webmanifest", "icons/icon.svg"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  const isShell = url.origin === location.origin && !url.pathname.startsWith("/proxy") && !url.pathname.startsWith("/api/");
  const isLib = url.hostname === "cdn.jsdelivr.net";
  if (!isShell && !isLib) return; // live feeds & imagery go straight to network
  // Network-first for our own files (fresh code), cache-first for the versioned library.
  e.respondWith(isLib
    ? caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return r; }))
    : fetch(e.request).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
