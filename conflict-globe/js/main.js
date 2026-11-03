// Conflict Globe — application entry point.

import { CATEGORIES, CAMEO_NAMES } from "./config.js";
import { settings } from "./settings.js";
import { routeFor } from "./net.js";
import { legendIcon, sprites } from "./sprites.js";
import { GdeltFeed } from "./feeds/gdelt.js";
import { AircraftFeed } from "./feeds/adsb.js";
import { demoEvents, demoAircraft } from "./feeds/demo.js";
import { EventLayer } from "./layers/events.js";
import { UnitLayer } from "./layers/units.js";
import { AircraftLayer } from "./layers/aircraft.js";

const C = window.Cesium;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ------------------------------------------------------------------ viewer
if (settings.get("ionToken")) C.Ion.defaultAccessToken = settings.get("ionToken");

const viewer = new C.Viewer("globe", {
  baseLayer: false,
  animation: false, timeline: false, geocoder: false, sceneModePicker: false, baseLayerPicker: false,
  navigationHelpButton: false, fullscreenButton: false, infoBox: false, selectionIndicator: false,
  homeButton: true, shouldAnimate: true, msaaSamples: 4, showRenderLoopErrors: false,
  terrain: settings.get("ionToken") ? C.Terrain.fromWorldTerrain() : undefined,
});
window.viewer = viewer; // handy for debugging from DevTools

const scene = viewer.scene;
// A transient failure (e.g. one asset request dropping) must not freeze the globe.
let renderErrors = 0;
scene.renderError.addEventListener((_, err) => {
  console.error("render error", err);
  if (++renderErrors > 20) return showBanner("The 3D view stopped after repeated errors. Reload the page to restart.");
  setTimeout(() => (viewer.useDefaultRenderLoop = true), 1000);
});
viewer.clock.clockStep = C.ClockStep.SYSTEM_CLOCK; // real-time sun position
scene.globe.enableLighting = true;
scene.globe.dynamicAtmosphereLighting = true;
scene.globe.showGroundAtmosphere = true;
scene.globe.depthTestAgainstTerrain = false;
scene.skyAtmosphere.show = true;
scene.fog.enabled = true;
scene.globe.maximumScreenSpaceError = 1.6;
scene.postProcessStages.fxaa.enabled = true;
viewer.cesiumWidget.creditContainer.style.fontSize = "10px";

const layers = viewer.imageryLayers;
// 1. Offline-safe base (bundled with Cesium) so the globe is never blank.
layers.add(C.ImageryLayer.fromProviderAsync(C.TileMapServiceImageryProvider.fromUrl(C.buildModuleUrl("Assets/Textures/NaturalEarthII"))));
// 2. Photorealistic satellite imagery.
layers.addImageryProvider(new C.UrlTemplateImageryProvider({
  url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  maximumLevel: 19,
  credit: new C.Credit("Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community"),
}));
// 3. City lights on the night side of the terminator.
const night = layers.addImageryProvider(new C.UrlTemplateImageryProvider({
  url: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png",
  maximumLevel: 8,
  credit: new C.Credit("Night lights: NASA Black Marble (GIBS)"),
}));
night.dayAlpha = 0.0;
night.nightAlpha = 0.85;
night.brightness = 1.6;
// 4. Borders and place names.
const borders = layers.addImageryProvider(new C.UrlTemplateImageryProvider({
  url: "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  maximumLevel: 19,
  credit: new C.Credit("Boundaries & places © Esri"),
}));
borders.show = settings.get("showBorders");

// Optional: Google Photorealistic 3D Tiles (true 3D cities and terrain worldwide).
if (settings.get("googleKey")) {
  C.createGooglePhotorealistic3DTileset({ key: settings.get("googleKey") })
    .then((tileset) => {
      scene.primitives.add(tileset);
      scene.globe.show = false;
    })
    .catch((e) => showBanner(`Google 3D Tiles failed to load: ${esc(e.message)}. Falling back to satellite imagery.`));
}

const HOME_HEIGHT = innerWidth < innerHeight ? 3.2e7 : 1.9e7; // fit the whole globe on portrait screens
viewer.camera.setView({ destination: C.Cartesian3.fromDegrees(35, 30, HOME_HEIGHT) });
viewer.homeButton.viewModel.command.beforeExecute.addEventListener((e) => {
  e.cancel = true;
  viewer.camera.flyTo({ destination: C.Cartesian3.fromDegrees(35, 30, HOME_HEIGHT), duration: 1.6 });
});

// ------------------------------------------------------------------ layers & feeds
const eventLayer = new EventLayer(viewer);
const unitLayer = new UnitLayer(viewer, () => eventLayer.all());
const aircraftLayer = new AircraftLayer(viewer);
window.__ac = aircraftLayer; // debugging hook
sprites(); // pre-render sprite frames

let events = [];
let selectedKey = null;
function onEvents(list) {
  events = list;
  eventLayer.setEvents(list);
  renderFeed();
}

function setChip(id, st, count) {
  const el = $(id);
  el.dataset.state = st.state;
  if (count !== undefined) el.querySelector("b").textContent = count;
  el.title = `${el.title.split(" — ")[0]} — ${st.text}`;
}

function cameraPoint() {
  const c = viewer.camera.positionCartographic;
  // Use the point the camera looks at, not the point under it, when tilted.
  const center = viewer.camera.pickEllipsoid(new C.Cartesian2(viewer.canvas.clientWidth / 2, viewer.canvas.clientHeight / 2));
  const carto = center ? C.Cartographic.fromCartesian(center) : c;
  return { lat: C.Math.toDegrees(carto.latitude), lon: C.Math.toDegrees(carto.longitude), height: c.height };
}

const demo = settings.get("demo");
let aircraftFeed = null;
if (demo) {
  showBanner("<b>DEMO MODE</b> — all events and aircraft shown are <b>simulated</b>. Turn off in Settings for live data.", "demo");
  onEvents(demoEvents());
  setChip("#chip-events", { state: "ok", text: "simulated" }, events.length);
  const fleet = demoAircraft();
  const step = () => {
    for (const a of fleet) {
      const d = (a.gs * 0.514444 * 2) / 111320;
      a.lat += Math.cos((a.track * Math.PI) / 180) * d;
      a.lon += (Math.sin((a.track * Math.PI) / 180) * d) / Math.cos((a.lat * Math.PI) / 180);
      a.track = (a.track + (Math.random() - 0.5) * 6 + 360) % 360;
    }
    aircraftLayer.ingest("mil", fleet, Date.now(), { name: "demo", link: () => "#" });
    setChip("#chip-mil", { state: "ok", text: "simulated" }, fleet.length);
  };
  step();
  setInterval(step, 2000);
  setChip("#chip-nearby", { state: "idle", text: "demo" }, "—");
} else {
  new GdeltFeed({
    onData: onEvents,
    onStatus: (st) => {
      setChip("#chip-events", st, events.length || "—");
      if (st.state === "error") feedHelp(st.text);
    },
  }).start();
  aircraftFeed = new AircraftFeed({
    getCameraPoint: cameraPoint,
    onData: (kind, list, now, provider) => aircraftLayer.ingest(kind, list, now, provider),
    onStatus: (kind, st) => {
      const c = aircraftLayer.counts();
      setChip(kind === "mil" ? "#chip-mil" : "#chip-nearby", st, kind === "mil" ? c.mil : (st.state === "idle" ? "—" : c.civ));
      if (st.state === "error") feedHelp(st.text);
    },
  });
  aircraftFeed.enabled = { mil: settings.get("showMilAir"), nearby: settings.get("showNearbyAir") };
  aircraftFeed.start();
}

let helpShown = false;
function feedHelp(msg) {
  if (helpShown) return;
  helpShown = true;
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  showBanner(local
    ? `A live feed could not be reached (${esc(msg)}). Check your internet connection; the app retries automatically.`
    : `A live feed is blocked by the browser (${esc(msg)}). Launch the app with <code>ConflictGlobe.cmd</code> (it includes a local proxy), or set a CORS proxy in Settings.`);
}

function showBanner(html, cls = "") {
  const b = $("#banner");
  b.innerHTML = html;
  b.className = cls;
  b.hidden = false;
  if (cls !== "demo") setTimeout(() => (b.hidden = true), 15000);
}

// ------------------------------------------------------------------ settings → layers
function applySetting(k, v) {
  switch (k) {
    case "showEvents": eventLayer.setVisible(v); break;
    case "showUnits": unitLayer.setEnabled(v); break;
    case "showMilAir": aircraftLayer.setMil(v); if (aircraftFeed) aircraftFeed.enabled.mil = v; break;
    case "showNearbyAir": aircraftLayer.setCivil(v); if (aircraftFeed) aircraftFeed.enabled.nearby = v; break;
    case "showLabels": aircraftLayer.setLabels(v); break;
    case "showBorders": borders.show = v; break;
    case "hiddenCats": eventLayer.setHiddenCategories(v); unitLayer.setHiddenCategories(v); renderFeed(); break;
  }
}
for (const k of ["showEvents", "showUnits", "showMilAir", "showNearbyAir", "showLabels", "showBorders", "hiddenCats"]) applySetting(k, settings.get(k));
settings.onChange(applySetting);

document.querySelectorAll("[data-set]").forEach((el) => {
  const k = el.dataset.set;
  if (el.type === "checkbox") el.checked = !!settings.get(k);
  else el.value = String(settings.get(k));
  el.addEventListener("change", () => {
    const v = el.type === "checkbox" ? el.checked : "num" in el.dataset ? Number(el.value) : el.value;
    settings.set(k, v);
    if (k === "historyHours" || k === "minSources") {
      showBanner("Event window changed — reloading events…");
      setTimeout(() => location.reload(), 400);
    }
  });
});

// ------------------------------------------------------------------ feed list
const catFilters = $("#cat-filters");
for (const [key, cat] of Object.entries(CATEGORIES)) {
  const b = document.createElement("button");
  b.innerHTML = `<img alt="" src="${legendIcon(key, cat.color, cat.glyph)}">${esc(cat.label.split(" ")[0].replace("/", ""))}`;
  b.title = cat.label;
  b.dataset.cat = key;
  b.setAttribute("aria-pressed", String(!settings.get("hiddenCats").includes(key)));
  b.onclick = () => {
    const hidden = new Set(settings.get("hiddenCats"));
    hidden.has(key) ? hidden.delete(key) : hidden.add(key);
    b.setAttribute("aria-pressed", String(!hidden.has(key)));
    settings.set("hiddenCats", [...hidden]);
  };
  catFilters.appendChild(b);
}

function ago(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function renderFeed() {
  const q = $("#feed-search").value.trim().toLowerCase();
  const hidden = new Set(settings.get("hiddenCats"));
  const list = events
    .filter((e) => !hidden.has(e.cat))
    .filter((e) => !q || `${e.title} ${e.place} ${e.actors.join(" ")} ${CATEGORIES[e.cat].label}`.toLowerCase().includes(q))
    .sort((a, b) => b.last - a.last || b.reports - a.reports);
  $("#feed-count").textContent = `${list.length.toLocaleString()} events`;
  const ol = $("#feed-list");
  if (!list.length) {
    ol.innerHTML = `<li class="empty">${events.length ? "No events match the filter." : "Waiting for event data…"}</li>`;
    return;
  }
  ol.innerHTML = list.slice(0, 300).map((e) => `
    <li data-key="${esc(e.key)}" class="${e.key === selectedKey ? "sel" : ""}">
      <span class="bar" style="background:${CATEGORIES[e.cat].color}"></span>
      <span><span class="t">${esc(e.title)}</span><br><span class="p">${esc(e.place)}</span></span>
      <span class="ago">${Date.now() - e.last < 3600e3 ? '<span class="new">NEW</span> ' : ""}${ago(e.last)}<span class="n">${e.reports}×</span></span>
    </li>`).join("");
}
$("#feed-list").addEventListener("click", (ev) => {
  const li = ev.target.closest("li[data-key]");
  if (!li) return;
  const e = eventLayer.get(li.dataset.key);
  if (e) { selectEvent(e); flyToEvent(e); }
});
$("#feed-search").addEventListener("input", renderFeed);
setInterval(renderFeed, 60000);

// ------------------------------------------------------------------ selection & info card
let followHex = null;

function flyToEvent(e) {
  viewer.camera.flyTo({
    destination: C.Cartesian3.fromDegrees(e.lon, e.lat - 0.085, 7500),
    orientation: { heading: 0, pitch: C.Math.toRadians(-48), roll: 0 },
    duration: 2.4,
  });
}

function selectEvent(e) {
  selectedKey = e.key;
  aircraftLayer.selected = null;
  followHex = null;
  const cat = CATEGORIES[e.cat];
  const precision = { 2: "province / state", 3: "city", 4: "city", 5: "landmark" }[e.precision] || "approximate";
  $("#info-body").innerHTML = `
    <span class="tag" style="background:${cat.color}">${esc(cat.label)}</span>
    <h3>${esc(e.title)}</h3>
    <div class="sub">${esc(e.place)}</div>
    <dl>
      <dt>Reports</dt><dd>${e.reports} merged report${e.reports > 1 ? "s" : ""}</dd>
      <dt>First / latest</dt><dd>${new Date(e.first).toISOString().slice(0, 16).replace("T", " ")} / ${new Date(e.last).toISOString().slice(11, 16)} UTC</dd>
      <dt>Location</dt><dd>${e.lat.toFixed(3)}, ${e.lon.toFixed(3)} <span class="muted">(${precision})</span></dd>
      ${e.actors.length ? `<dt>Actors</dt><dd>${esc(e.actors.join(", "))}</dd>` : ""}
      <dt>CAMEO code</dt><dd>${esc(e.code)} — ${esc(CAMEO_NAMES[e.code] || "")}</dd>
      <dt>Source</dt><dd>${esc(e.source)}</dd>
    </dl>
    ${e.urls.length ? `<b>Source articles</b><ol class="links">${e.urls.map((u) => `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(new URL(u).hostname.replace(/^www\./, ""))}</a></li>`).join("")}</ol>` : ""}
    <div class="btns"><button class="primary" id="info-fly">Zoom to event</button></div>
    <p class="note">Units animated around this point illustrate the reported event type; they are not tracked positions.</p>`;
  $("#info-fly").onclick = () => flyToEvent(e);
  $("#info").hidden = false;
  renderFeed();
}

function selectAircraft(rec) {
  selectedKey = null;
  aircraftLayer.selected = rec;
  renderAircraftInfo(rec);
  $("#info").hidden = false;
}

function renderAircraftInfo(rec) {
  const a = rec.data;
  const id = (a.flight || "").trim() || a.r || rec.hex.toUpperCase();
  const alt = a.alt_baro === "ground" ? "On ground" : typeof a.alt_baro === "number" ? `${a.alt_baro.toLocaleString()} ft (${Math.round(a.alt_baro * 0.3048).toLocaleString()} m)` : "—";
  $("#info-body").innerHTML = `
    <span class="tag" style="background:${rec.mil ? "#ffd23f" : "#8ecbff"}">${rec.mil ? "Military aircraft" : "Aircraft"} · live ADS-B</span>
    <h3>${esc(id)}</h3>
    <div class="sub">${esc(a.desc || a.t || "Unknown type")} ${a.ownOp ? "· " + esc(a.ownOp) : ""}</div>
    <dl>
      <dt>ICAO hex</dt><dd>${esc(rec.hex.toUpperCase())}</dd>
      <dt>Registration</dt><dd>${esc(a.r || "—")}</dd>
      <dt>Type</dt><dd>${esc(a.t || "—")} <span class="muted">(drawn as ${esc(rec.cls)})</span></dd>
      <dt>Altitude</dt><dd>${alt}</dd>
      <dt>Ground speed</dt><dd>${a.gs ? Math.round(a.gs) + " kt" : "—"}</dd>
      <dt>Track</dt><dd>${a.track !== undefined ? Math.round(a.track) + "°" : "—"}</dd>
      <dt>Squawk</dt><dd>${esc(a.squawk || "—")}${["7500", "7600", "7700"].includes(a.squawk) ? ' <b style="color:var(--err)">EMERGENCY</b>' : ""}</dd>
      <dt>Position</dt><dd>${a.lat.toFixed(4)}, ${a.lon.toFixed(4)}</dd>
      <dt>Position age</dt><dd>${Math.max(0, Math.round((Date.now() - rec.fix.t) / 1000))} s via ${esc(rec.provider?.name || "")}</dd>
    </dl>
    <div class="btns">
      <button class="primary" id="info-follow">${followHex === rec.hex ? "Stop following" : "Follow"}</button>
      ${a._demo ? "" : `<a class="ghost" href="${esc(rec.provider.link(rec.hex))}" target="_blank" rel="noopener">Open in ${esc(rec.provider.name)} ↗</a>`}
    </div>`;
  $("#info-follow").onclick = () => {
    followHex = followHex === rec.hex ? null : rec.hex;
    renderAircraftInfo(rec);
  };
}
setInterval(() => {
  const rec = aircraftLayer.selected;
  if (rec && !$("#info").hidden) aircraftLayer.get(rec.hex) ? renderAircraftInfo(aircraftLayer.get(rec.hex)) : null;
}, 2000);

// Follow mode: the camera rides along in the aircraft's local frame, so the
// user can still orbit and zoom around it with the mouse.
let following = null;
scene.postUpdate.addEventListener(() => {
  if (!followHex) {
    if (following) { viewer.camera.lookAtTransform(C.Matrix4.IDENTITY); following = null; }
    return;
  }
  const rec = aircraftLayer.get(followHex);
  if (!rec?.pos) return;
  if (following !== followHex) {
    viewer.camera.lookAt(rec.pos, new C.HeadingPitchRange(viewer.camera.heading, C.Math.toRadians(-30), 60000));
    following = followHex;
  } else {
    viewer.camera.lookAtTransform(C.Transforms.eastNorthUpToFixedFrame(rec.pos));
  }
});

$("#info-close").onclick = () => {
  $("#info").hidden = true;
  selectedKey = null;
  aircraftLayer.selected = null;
  followHex = null;
  renderFeed();
};

const handler = new C.ScreenSpaceEventHandler(viewer.canvas);
handler.setInputAction((click) => {
  // Aircraft sit above markers in priority so overlapping symbols stay clickable.
  const hits = scene.drillPick(click.position, 6);
  const picked = hits.find((h) => h.id?.kind === "aircraft") || hits[0];
  const id = picked?.id;
  if (!id) return;
  if (id instanceof C.Entity && id._cg?.kind === "event") return selectEvent(eventLayer.get(id._cg.key));
  if (Array.isArray(id)) { // cluster
    const pos = picked.primitive.position;
    const carto = C.Cartographic.fromCartesian(pos);
    const h = Math.max(30000, viewer.camera.positionCartographic.height / 3.5);
    return viewer.camera.flyTo({ destination: C.Cartesian3.fromRadians(carto.longitude, carto.latitude, h), duration: 1.3 });
  }
  if (id.kind === "event" && eventLayer.get(id.key)) return selectEvent(eventLayer.get(id.key));
  if (id.kind === "aircraft" && aircraftLayer.get(id.hex)) return selectAircraft(aircraftLayer.get(id.hex));
}, C.ScreenSpaceEventType.LEFT_CLICK);

handler.setInputAction((move) => {
  const p = viewer.camera.pickEllipsoid(move.endPosition);
  if (!p) { $("#st-cursor").textContent = "—"; return; }
  const c = C.Cartographic.fromCartesian(p);
  const lat = C.Math.toDegrees(c.latitude), lon = C.Math.toDegrees(c.longitude);
  $("#st-cursor").textContent = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? "E" : "W"}`;
}, C.ScreenSpaceEventType.MOUSE_MOVE);

// ------------------------------------------------------------------ chrome
function tickClock() {
  $("#clock").textContent = new Date().toISOString().slice(11, 19) + " UTC";
  const h = viewer.camera.positionCartographic.height;
  $("#st-alt").textContent = `eye ${h > 1e5 ? (h / 1000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " km" : (h / 1000).toFixed(1) + " km"}`;
  const c = aircraftLayer.counts();
  $("#st-units").textContent = `${unitLayer.activeCount} animated scenes · ${c.mil} mil / ${c.civ} other aircraft`;
  $("#st-route").textContent = demo ? "demo data" : `events via ${routeFor("http://data.gdeltproject.org/")} · aircraft via ${routeFor("https://api.adsb.lol/")}`;
  if (!demo && aircraftFeed) {
    $("#chip-mil b").textContent = c.mil;
    if ($("#chip-nearby").dataset.state === "ok") $("#chip-nearby b").textContent = c.civ;
  }
}
setInterval(tickClock, 1000);
tickClock();

// legend
const legend = $("#legend-body");
legend.innerHTML = Object.entries(CATEGORIES).map(([k, c]) => `<div class="li"><img alt="" src="${legendIcon(k, c.color, c.glyph)}">${esc(c.label)}</div>`).join("")
  + `<div class="sep">Live aircraft (ADS-B)</div>`
  + ["fighter", "transport", "tanker", "helicopter", "drone", "bomber", "civil"].map((k) => `<div class="li"><img alt="" src="${sprites()["ac_" + k][0].canvas.toDataURL()}">${k[0].toUpperCase() + k.slice(1)}</div>`).join("");
$("#legend-toggle").onclick = () => $("#legend").classList.toggle("collapsed");
if (innerHeight < 1000) $("#legend").classList.add("collapsed");

// panel buttons
const feedBtn = $("#btn-feed");
feedBtn.setAttribute("aria-pressed", "true");
feedBtn.onclick = () => feedBtn.setAttribute("aria-pressed", String(!$("#feed").classList.toggle("collapsed")));
if (innerWidth < 760) feedBtn.click();
$("#btn-layers").onclick = () => { const p = $("#layers"); p.hidden = !p.hidden; $("#btn-layers").setAttribute("aria-pressed", String(!p.hidden)); };
$("#btn-about").onclick = () => $("#dlg-about").showModal();
$("#btn-full").onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());

const dlg = $("#dlg-settings");
$("#btn-settings").onclick = () => {
  $("#in-google").value = settings.get("googleKey");
  $("#in-ion").value = settings.get("ionToken");
  $("#in-proxy").value = settings.get("proxyUrl");
  $("#in-demo").checked = settings.get("demo");
  dlg.showModal();
};
dlg.addEventListener("close", () => {
  if (dlg.returnValue !== "save") return;
  settings.set("googleKey", $("#in-google").value.trim());
  settings.set("ionToken", $("#in-ion").value.trim());
  settings.set("proxyUrl", $("#in-proxy").value.trim());
  settings.set("demo", $("#in-demo").checked);
  const url = new URL(location.href);
  url.search = "";
  location.href = url.toString();
});

// keyboard shortcuts
addEventListener("keydown", (e) => {
  if (e.target.matches("input, select, textarea")) return;
  if (e.key === "f") feedBtn.click();
  if (e.key === "l") $("#btn-layers").click();
  if (e.key === "Escape") $("#info-close").click();
  if (e.key === "h") viewer.homeButton.viewModel.command();
});

// ------------------------------------------------------------------ PWA install (Windows: installs as a desktop app)
let deferredPrompt = null;
addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $("#btn-install").hidden = false;
});
$("#btn-install").onclick = async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $("#btn-install").hidden = true;
};
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
