// Conflict Globe — application entry point.

import { CATEGORIES, CAMEO_NAMES, FORCES, STATUSES } from "./config.js";
import { settings } from "./settings.js";
import { routeFor } from "./net.js";
import { legendIcon, sprites, radioSprite, forceIcon } from "./sprites.js";
import { GdeltFeed } from "./feeds/gdelt.js";
import { AircraftFeed } from "./feeds/adsb.js";
import { demoEvents, demoAircraft, demoRadioReports } from "./feeds/demo.js";
import { PskReporterFeed } from "./feeds/pskreporter.js";
import { RadioLayer, BAND_COLORS } from "./layers/radio.js";
import * as ghost from "./ghostnet/plan.js";
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
const radioLayer = new RadioLayer(viewer);
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
let ghostStatus = { state: demo ? "ok" : "idle", text: demo ? "simulated" : "waiting" };
const freq = (khz) => (khz >= 1000 ? (khz / 1000).toFixed(khz % 1 ? 4 : 3) + " MHz" : khz + " kHz");
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
  radioLayer.setReports(demoRadioReports());
  setChip("#chip-ghost", { state: "ok", text: "simulated" }, radioLayer.summary().tx);
} else {
  new PskReporterFeed({
    onData: (reports) => { radioLayer.setReports(reports); renderGhost(); },
    onStatus: (st) => { ghostStatus = st; setChip("#chip-ghost", st, st.state === "ok" ? radioLayer.summary().tx : "—"); renderGhost(); },
  }).start();
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
    case "showRadio": radioLayer.setVisible(v); break;
    case "hiddenCats": eventLayer.setHiddenCategories(v); unitLayer.setHiddenCategories(v); renderFeed(); break;
    case "hiddenForces": eventLayer.setHiddenForces(v); unitLayer.setHiddenForces(v); renderFeed(); break;
    case "hiddenStatus": eventLayer.setHiddenStatus(v); renderFeed(); break;
  }
}
for (const k of ["showEvents", "showUnits", "showMilAir", "showNearbyAir", "showLabels", "showBorders", "showRadio", "hiddenCats", "hiddenForces", "hiddenStatus"]) applySetting(k, settings.get(k));
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
// Force filter: who initiated the event. Separate from the action type below.
const forceFilters = $("#force-filters");
for (const [key, f] of Object.entries(FORCES)) {
  const b = document.createElement("button");
  b.innerHTML = `<img alt="" src="${forceIcon(key, f.color)}">${esc(f.short)} <span class="cnt" data-force-count="${key}">0</span>`;
  b.title = f.desc;
  b.dataset.force = key;
  b.setAttribute("aria-pressed", String(!settings.get("hiddenForces").includes(key)));
  b.onclick = () => {
    const hidden = new Set(settings.get("hiddenForces"));
    hidden.has(key) ? hidden.delete(key) : hidden.add(key);
    b.setAttribute("aria-pressed", String(!hidden.has(key)));
    settings.set("hiddenForces", [...hidden]);
  };
  forceFilters.appendChild(b);
}
// Verification filter: does the coverage actually describe violence?
const statusFilters = $("#status-filters");
for (const [key, st] of Object.entries(STATUSES)) {
  const b = document.createElement("button");
  b.innerHTML = `<span class="sdot s-${key}"></span>${esc(st.label)} <span class="cnt" data-status-count="${key}">0</span>`;
  b.title = st.desc;
  b.setAttribute("aria-pressed", String(!settings.get("hiddenStatus").includes(key)));
  b.onclick = () => {
    const hidden = new Set(settings.get("hiddenStatus"));
    hidden.has(key) ? hidden.delete(key) : hidden.add(key);
    b.setAttribute("aria-pressed", String(!hidden.has(key)));
    settings.set("hiddenStatus", [...hidden]);
  };
  statusFilters.appendChild(b);
}
const catFilters = $("#cat-filters");
for (const [key, cat] of Object.entries(CATEGORIES)) {
  const b = document.createElement("button");
  b.innerHTML = `<img alt="" src="${legendIcon(key, cat.color, cat.glyph)}">${esc(cat.short)}`;
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
  const hiddenF = new Set(settings.get("hiddenForces"));
  const hiddenS = new Set(settings.get("hiddenStatus"));
  const counts = Object.fromEntries(Object.keys(FORCES).map((k) => [k, 0]));
  const sCounts = Object.fromEntries(Object.keys(STATUSES).map((k) => [k, 0]));
  for (const e of events) {
    if (!hidden.has(e.cat) && !hiddenS.has(e.status)) counts[e.force || "unattributed"]++;
    if (!hidden.has(e.cat) && !hiddenF.has(e.force)) sCounts[e.status || "verified"]++;
  }
  document.querySelectorAll("[data-force-count]").forEach((el) => (el.textContent = counts[el.dataset.forceCount].toLocaleString()));
  document.querySelectorAll("[data-status-count]").forEach((el) => (el.textContent = sCounts[el.dataset.statusCount].toLocaleString()));
  const list = events
    .filter((e) => !hidden.has(e.cat) && !hiddenF.has(e.force) && !hiddenS.has(e.status || "verified"))
    .filter((e) => !q || `${e.title} ${e.place} ${e.actors.join(" ")} ${CATEGORIES[e.cat].label} ${FORCES[e.force].label} ${(e.headlines || []).map((h) => h.text).join(" ")}`.toLowerCase().includes(q))
    .sort((a, b) => (a.status === "verified" ? 0 : 1) - (b.status === "verified" ? 0 : 1) || b.last - a.last || b.reports - a.reports);
  $("#feed-count").textContent = `${list.length.toLocaleString()} events`;
  const ol = $("#feed-list");
  if (!list.length) {
    ol.innerHTML = `<li class="empty">${events.length ? "No events match the filter." : "Waiting for event data…"}</li>`;
    return;
  }
  ol.innerHTML = list.slice(0, 300).map((e) => `
    <li data-key="${esc(e.key)}" class="${e.key === selectedKey ? "sel" : ""} st-${e.status || "verified"}">
      <span class="bar" style="background:${CATEGORIES[e.cat].color}"></span>
      <span><span class="ftag" style="--fc:${FORCES[e.force].color}">${esc(FORCES[e.force].short)}</span>${e.status && e.status !== "verified" ? ` <span class="stag s-${e.status}">${esc(STATUSES[e.status].label)}</span>` : ""} <span class="t">${esc(e.title)}</span><br><span class="p">${esc(e.place)}</span>${e.headlines?.[0] ? `<br><span class="hl">“${esc(e.headlines[0].text)}”</span>` : ""}</span>
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
  const force = FORCES[e.force];
  const targets = (e.targets || []).filter((t) => t !== "unattributed").map((t) => FORCES[t].short);
  const precision = { 2: "province / state", 3: "city", 4: "city", 5: "landmark" }[e.precision] || "approximate";
  $("#info-body").innerHTML = `
    <span class="tag" style="background:${force.color};color:#fff">${esc(force.label)}</span>
    <span class="tag" style="background:${cat.color}">${esc(cat.label)}</span>
    <span class="tag s-${e.status || "verified"}">${esc(STATUSES[e.status || "verified"].label)}</span>
    <h3>${esc(e.title)}</h3>
    <div class="sub">${esc(e.place)}</div>
    <dl>
      <dt>Verification</dt><dd>${esc(e.reason || STATUSES.verified.desc)}</dd>
      ${e.coded && e.coded !== e.title ? `<dt>Machine coding</dt><dd>${esc(e.coded)} <span class="muted">(replaced by what the coverage describes)</span></dd>` : ""}
      ${e.confidence ? `<dt>Coding confidence</dt><dd>${e.confidence}% <span class="muted">(GDELT extraction confidence)</span></dd>` : ""}
      <dt>Initiated by</dt><dd>${esc(force.label)}<br><span class="muted small">${esc(force.desc)}</span></dd>
      ${targets.length ? `<dt>Target</dt><dd>${esc([...new Set(targets)].join(", "))}</dd>` : ""}
      <dt>Reports</dt><dd>${e.reports} merged report${e.reports > 1 ? "s" : ""}</dd>
      <dt>First / latest</dt><dd>${new Date(e.first).toISOString().slice(0, 16).replace("T", " ")} / ${new Date(e.last).toISOString().slice(11, 16)} UTC</dd>
      <dt>Location</dt><dd>${e.lat.toFixed(3)}, ${e.lon.toFixed(3)} <span class="muted">(${precision})</span></dd>
      ${e.actors.length ? `<dt>Actors</dt><dd>${esc(e.actors.join(", "))}</dd>` : ""}
      <dt>CAMEO code</dt><dd>${esc(e.code)} — ${esc(CAMEO_NAMES[e.code] || "")}</dd>
      <dt>Source</dt><dd>${esc(e.source)}</dd>
    </dl>
    ${e.headlines?.length ? `<b>What the coverage says</b><ol class="links">${e.headlines.map((h) => `<li><a href="${esc(h.url)}" target="_blank" rel="noopener noreferrer">${esc(h.text)}</a> <span class="muted small">— ${esc(new URL(h.url).hostname.replace(/^www\./, ""))}${h.kind === "kinetic" ? "" : ` · ${h.kind === "figurative" ? "non-violent" : h.kind === "mixed" ? "mixed" : "no violence terms"}`}</span></li>`).join("")}</ol>`
      : e.urls.length ? `<b>Source articles</b><ol class="links">${e.urls.map((u) => `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(new URL(u).hostname.replace(/^www\./, ""))}</a></li>`).join("")}</ol>` : ""}
    <div class="btns"><button class="primary" id="info-fly">Zoom to event</button></div>
    <p class="note">${e.status && e.status !== "verified" ? "Not animated: the coverage does not confirm physical violence." : e.force === "unattributed"
      ? "No military, armed-group or police actor was identified as the initiator, so no combatants are drawn here."
      : `Figures animated around this point illustrate the reported event (${esc(force.short.toLowerCase())}); they are not tracked positions.`}</p>`;
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
  const hits = scene.drillPick(click.position, 12);
  const picked = hits.find((h) => h.id?.kind === "aircraft") || hits.find((h) => h.id?.kind === "radio") || hits[0];
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
  if (id.kind === "radio" && radioLayer.get(id.call)) return selectRadio(radioLayer.get(id.call));
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
legend.innerHTML = `<div class="sep" style="margin-top:0">Who acted (marker shape)</div>`
  + Object.entries(FORCES).map(([k, f]) => `<div class="li"><img alt="" src="${forceIcon(k, f.color)}">${esc(f.label)}</div>`).join("")
  + `<div class="sep">What happened (colour)</div>`
  + Object.entries(CATEGORIES).map(([k, c]) => `<div class="li"><img alt="" src="${legendIcon(k, c.color, c.glyph)}">${esc(c.label)}</div>`).join("")
  + `<div class="sep">GhostNet HF radio (JS8Call)</div>`
  + Object.entries(BAND_COLORS).map(([b, c]) => `<div class="li"><img alt="" src="${radioSprite(c).toDataURL()}">Station heard on ${b}</div>`).join("")
  + `<div class="li"><img alt="" src="${radioSprite("#9aa7b4").toDataURL()}">Receiving station</div>`
  + `<div class="li"><img alt="" src="${radioSprite("#9ef01a", true).toDataURL()}">Known HFN ALE net address</div>`
  + `<div class="sep">Live aircraft (ADS-B)</div>`
  + ["fighter", "transport", "tanker", "helicopter", "drone", "bomber", "civil"].map((k) => `<div class="li"><img alt="" src="${sprites()["ac_" + k][0].canvas.toDataURL()}">${k[0].toUpperCase() + k.slice(1)}</div>`).join("");
$("#legend-toggle").onclick = () => $("#legend").classList.toggle("collapsed");
if (innerHeight < 1000) $("#legend").classList.add("collapsed");

// panel buttons
const feedBtn = $("#btn-feed");
feedBtn.setAttribute("aria-pressed", "true");
feedBtn.onclick = () => feedBtn.setAttribute("aria-pressed", String(!$("#feed").classList.toggle("collapsed")));
if (innerWidth < 760) feedBtn.click();
function togglePopover(id, btn) {
  for (const [pid, bid] of [["#layers", "#btn-layers"], ["#ghost", "#btn-ghost"]]) {
    const open = pid === id ? $(pid).hidden : false;
    $(pid).hidden = !open;
    $(bid).setAttribute("aria-pressed", String(open));
  }
  if (id === "#ghost" && !$("#ghost").hidden) renderGhost();
}
$("#btn-layers").onclick = () => togglePopover("#layers");
$("#btn-ghost").onclick = () => togglePopover("#ghost");
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
  if (e.key === "g") $("#btn-ghost").click();
  if (e.key === "Escape") $("#info-close").click();
  if (e.key === "h") viewer.homeButton.viewModel.command();
});

// ------------------------------------------------------------------ GhostNet panel

function renderGhost() {
  const now = new Date();
  const active = ghost.activeWindows(now);
  const chip = $("#chip-ghost");
  chip.dataset.onair = String(active.length > 0);
  if (active.length) chip.querySelector("b").textContent = "ON AIR";
  else if (ghostStatus.state === "ok") chip.querySelector("b").textContent = radioLayer.summary().tx;
  if ($("#ghost").hidden) return;

  // Next start of each net, deduplicated.
  const seen = new Set();
  const next = ghost.upcomingWindows(now, 40).filter((w) => !seen.has(w.net) && seen.add(w.net)).slice(0, 4);
  $("#ghost-now").innerHTML = (active.length
    ? active.map((w) => `<div class="onair"><b class="flag">● ON AIR NOW</b><br><b>${esc(w.net)}</b><br>${esc(w.mode)}${w.khz ? ` · <span class="mono">${freq(w.khz)}</span>` : ""} · ends in ${ghost.fmtDuration(w.endsIn)}${w.note ? `<br><span class="muted small">${esc(w.note)}</span>` : ""}</div>`).join("")
    : `<div class="offair muted">No GhostNet comm window is active right now.</div>`)
    + `<table><tr><th>Next</th><th>Starts (UTC)</th><th>In</th></tr>${next.map((w) => `<tr><td>${esc(w.net)}</td><td class="mono">${ghost.dayName(w.day)} ${w.start}Z</td><td>${ghost.fmtDuration(w.startsIn)}</td></tr>`).join("")}</table>`;

  const sum = radioLayer.summary();
  $("#ghost-live").innerHTML = `
    <div style="margin-top:10px"><b>Live JS8Call activity</b> <span class="muted small">— ${esc(ghostStatus.text)}</span></div>
    <div class="ghost-live">${["80m", "40m", "20m"].map((b) => `<div style="border-color:${BAND_COLORS[b]}55"><b style="color:${BAND_COLORS[b]}">${sum.byBand[b]}</b>${b} · ${freq(ghost.JS8_DIALS.find((d) => d.band === b).khz)}</div>`).join("")}</div>
    <div class="muted small">${sum.tx} transmitting station${sum.tx === 1 ? "" : "s"} (${sum.recent} in last 15 min), ${sum.total} total incl. receivers, last hour.</div>`;

  if (!$("#ghost-sched").dataset.done) {
    $("#ghost-sched").dataset.done = "1";
    $("#ghost-sched").innerHTML = `<table><tr><th>Net</th><th>When</th><th>Mode / freq</th></tr>${ghost.WINDOWS.map((w) => `<tr><td>${esc(w.net)}</td><td class="mono">${ghost.dayName(w.day)} ${w.start}–${w.end}</td><td>${esc(w.mode)}${w.khz ? `<br><span class="mono">${freq(w.khz)}</span>` : ""}</td></tr>`).join("")}</table>
      <p class="muted small">GhostNet North America runs Friday 0100Z, which is Thursday evening in North America.</p>`;
    $("#ghost-freqs").innerHTML = `<table><tr><th>JS8Call dial</th><th>Use</th></tr>${ghost.JS8_DIALS.map((d) => `<tr><td class="mono">${freq(d.khz)} (${d.band})</td><td>${esc(d.use)}</td></tr>`).join("")}
      ${ghost.OTHER_FREQS.map((d) => `<tr><td class="mono">${freq(d.khz)}</td><td>${esc(d.mode)} — ${esc(d.use)}</td></tr>`).join("")}</table>
      <table><tr><th>ALE channel (USB)</th><th>Freq</th></tr>${ghost.ALE_CHANNELS.map((c) => `<tr><td class="mono">${c.name}</td><td class="mono">${freq(c.khz)}</td></tr>`).join("")}</table>`;
    $("#ghost-groups").innerHTML = `<table>${ghost.GROUPS.map(([g, d]) => `<tr><td class="mono">${esc(g)}</td><td>${esc(d)}</td></tr>`).join("")}</table>`;
    $("#ghost-src").href = ghost.GHOSTNET_URL;
    $("#ghost-attr").innerHTML = `${esc(ghost.GHOSTNET_ATTRIBUTION)}. Live reports: <a href="https://pskreporter.info" target="_blank" rel="noopener">PSKReporter</a>. Hearing a station on these frequencies does not mean it is part of GhostNet.`;
  }
}
setInterval(renderGhost, 30000);
renderGhost();

function selectRadio(s) {
  selectedKey = null;
  aircraftLayer.selected = null;
  followHex = null;
  const sim = s.call.startsWith("SIM");
  $("#info-body").innerHTML = `
    <span class="tag" style="background:${s.tx ? BAND_COLORS[[...s.bands][0]] : "#9aa7b4"}">GhostNet frequency · JS8Call</span>
    <h3>${esc(s.call)}</h3>
    <div class="sub">${s.tx ? "Heard transmitting" : "Receiving station"} · grid ${esc(s.grid)}${s.member ? " · <b style=\"color:#ffd700\">HFN ALE net address</b>" : ""}</div>
    <dl>
      <dt>Bands</dt><dd>${[...s.bands].join(", ")}</dd>
      ${s.tx ? `<dt>Last frequency</dt><dd class="mono">${(s.lastHz / 1e6).toFixed(6)} MHz</dd><dt>Heard by</dt><dd>${s.heardBy.size} station${s.heardBy.size === 1 ? "" : "s"}</dd><dt>Best SNR</dt><dd>${s.bestSnr ?? "—"} dB</dd>` : ""}
      ${s.heard.size ? `<dt>Decoded</dt><dd>${s.heard.size} transmitting station${s.heard.size === 1 ? "" : "s"}</dd>` : ""}
      <dt>Last report</dt><dd>${ago(s.last)}</dd>
      <dt>Location</dt><dd>${s.lat.toFixed(2)}, ${s.lon.toFixed(2)} <span class="muted">(grid square centre)</span></dd>
    </dl>
    <div class="btns">${sim ? "" : `<a class="ghost" href="https://pskreporter.info/pskmap.html?preset&callsign=${encodeURIComponent(s.call)}&mode=JS8" target="_blank" rel="noopener">PSKReporter map ↗</a>`}</div>
    <p class="note">${sim ? "Simulated station (demo mode)." : "From automatic PSKReporter reception reports. Being heard on a GhostNet frequency does not mean this station is taking part in GhostNet."}</p>`;
  $("#info").hidden = false;
}

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
