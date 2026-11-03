// Live aircraft layer: real ADS-B positions, dead-reckoned between polls so
// motion is continuous, drawn with a silhouette matching the reported ICAO
// type (fighter, tanker, transport, helicopter, drone, bomber, airliner…),
// labelled with callsign / type / altitude and trailed by their recent track.

import { aircraftClass, isMilitary, REFRESH } from "../config.js";
import { sprites } from "../sprites.js";

const C = window.Cesium;
const FT = 0.3048, KT = 0.514444;
const R_EARTH = 6371000;
const SIZE = { fighter: 34, bomber: 46, transport: 44, tanker: 44, airliner: 34, light: 24, helicopter: 32, drone: 34, civil: 26 };
const MIL_LABEL = C.Color.fromCssColorString("#ffe08a");
const CIV_LABEL = C.Color.fromCssColorString("#cfe8ff");
const MIL_TRAIL = C.Color.fromCssColorString("#ffcf4a").withAlpha(0.55);
const CIV_TRAIL = C.Color.fromCssColorString("#8ecbff").withAlpha(0.35);

function altitudeMeters(a) {
  if (a.alt_baro === "ground") return 0;
  const ft = typeof a.alt_geom === "number" ? a.alt_geom : a.alt_baro;
  return typeof ft === "number" ? Math.max(0, ft * FT) : 0;
}

/** Move a lat/lon point along a great circle. */
function project(lat, lon, bearingDeg, dist) {
  const d = dist / R_EARTH, b = bearingDeg * Math.PI / 180, φ1 = lat * Math.PI / 180, λ1 = lon * Math.PI / 180;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(b));
  const λ2 = λ1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2));
  return [φ2 * 180 / Math.PI, ((λ2 * 180 / Math.PI + 540) % 360) - 180];
}

export class AircraftLayer {
  constructor(viewer) {
    this.viewer = viewer;
    const scene = viewer.scene;
    this.bbs = scene.primitives.add(new C.BillboardCollection({ scene }));
    this.labels = scene.primitives.add(new C.LabelCollection({ scene }));
    this.trails = scene.primitives.add(new C.PolylineCollection());
    this.map = new Map(); // hex -> record
    this.showLabels = true;
    this.showMil = true;
    this.showCivil = true;
    this.providerFor = new Map();
    scene.preRender.addEventListener(() => this.tick());
  }

  ingest(kind, list, serverNow, provider) {
    const now = Date.now();
    const skew = now - serverNow; // align provider clock to ours
    for (const a of list) {
      const hex = a.hex;
      if (!hex) continue;
      let rec = this.map.get(hex);
      const mil = isMilitary(a) || rec?.mil;
      const cls = mil ? aircraftClass(a) : (["helicopter", "light", "drone"].includes(aircraftClass(a)) ? aircraftClass(a) : "civil");
      const seen = serverNow + skew - (a.seen_pos ?? a.seen ?? 0) * 1000;
      const fix = { lat: a.lat, lon: a.lon, alt: altitudeMeters(a), gs: (a.gs || 0) * KT, track: a.track ?? a.true_heading ?? 0, t: seen };
      if (!rec) {
        rec = { hex, fix, err: [0, 0, 0], trail: [], anim: null, cls: null };
        this.map.set(hex, rec);
      } else {
        // Blend from where we were drawing it to the new fix to avoid jumps.
        const [plat, plon, palt] = this.predict(rec, now);
        rec.fix = fix;
        const [nlat, nlon, nalt] = this.predict({ fix, err: [0, 0, 0] }, now);
        rec.err = [plat - nlat, plon - nlon, palt - nalt];
        if (Math.abs(rec.err[1]) > 1 || Math.abs(rec.err[0]) > 1) rec.err = [0, 0, 0];
        rec.errT = now;
      }
      rec.mil = mil;
      rec.data = a;
      rec.lastSeen = now;
      rec.provider = provider;
      rec.via ||= kind;
      if (kind === "mil") rec.via = "mil";
      if (rec.cls !== cls) this.rebuild(rec, cls);
      const last = rec.trail[rec.trail.length - 1];
      if (!last || last[0] !== a.lat || last[1] !== a.lon) {
        rec.trail.push([a.lat, a.lon, fix.alt]);
        if (rec.trail.length > 60) rec.trail.shift();
        this.updateTrail(rec);
      }
      this.updateLabel(rec);
    }
  }

  rebuild(rec, cls) {
    this.dispose(rec, true);
    rec.cls = cls;
    const frames = sprites()[`ac_${cls}`];
    const w = SIZE[cls] || 32;
    rec.anim = frames.map((f) => {
      const b = this.bbs.add({
        width: w, height: w,
        alignedAxis: C.Cartesian3.UNIT_Z,
        scaleByDistance: new C.NearFarScalar(5e3, 1.5, 8e6, 0.45),
        disableDepthTestDistance: 2e6,
        id: { kind: "aircraft", hex: rec.hex },
        show: false,
      });
      b.setImage(f.id, f.canvas);
      return b;
    });
    rec.label = this.labels.add({
      font: "600 12px system-ui, 'Segoe UI', sans-serif",
      fillColor: rec.mil ? MIL_LABEL : CIV_LABEL,
      outlineColor: C.Color.BLACK, outlineWidth: 3,
      style: C.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new C.Cartesian2(16, -14),
      horizontalOrigin: C.HorizontalOrigin.LEFT,
      distanceDisplayCondition: new C.DistanceDisplayCondition(0, rec.mil ? 4.5e6 : 6e5),
      disableDepthTestDistance: 2e6,
      scaleByDistance: new C.NearFarScalar(5e4, 1, 4e6, 0.75),
      id: { kind: "aircraft", hex: rec.hex },
    });
    rec.frame = -1;
  }

  updateLabel(rec) {
    if (!rec.label) return;
    const a = rec.data;
    const id = (a.flight || "").trim() || a.r || rec.hex.toUpperCase();
    const fl = a.alt_baro === "ground" ? "GND" : typeof a.alt_baro === "number" ? `FL${String(Math.round(a.alt_baro / 100)).padStart(3, "0")}` : "";
    rec.label.text = `${id}${a.t ? " · " + a.t : ""}${fl ? " · " + fl : ""}`;
  }

  updateTrail(rec) {
    if (rec.trail.length < 2) return;
    const positions = rec.trail.map(([lat, lon, alt]) => C.Cartesian3.fromDegrees(lon, lat, alt));
    if (!rec.poly) {
      rec.poly = this.trails.add({ positions, width: rec.mil ? 2 : 1.2, material: C.Material.fromType("Color", { color: rec.mil ? MIL_TRAIL : CIV_TRAIL }) });
    } else rec.poly.positions = positions;
  }

  predict(rec, now) {
    const f = rec.fix;
    const dt = Math.min(90, Math.max(0, (now - f.t) / 1000));
    const [lat, lon] = f.gs > 1 ? project(f.lat, f.lon, f.track, f.gs * dt) : [f.lat, f.lon];
    let k = 0;
    if (rec.errT) k = Math.exp(-(now - rec.errT) / 1200);
    return [lat + rec.err[0] * k, lon + rec.err[1] * k, f.alt + rec.err[2] * k];
  }

  tick() {
    const now = Date.now();
    for (const [hex, rec] of this.map) {
      if (now - rec.lastSeen > REFRESH.aircraftStaleMs) { this.dispose(rec); this.map.delete(hex); continue; }
      const visible = rec.mil ? this.showMil : this.showCivil;
      if (!rec.anim) continue;
      if (!visible) { rec.anim.forEach((b) => (b.show = false)); rec.label.show = false; if (rec.poly) rec.poly.show = false; continue; }
      const [lat, lon, alt] = this.predict(rec, now);
      const pos = C.Cartesian3.fromDegrees(lon, lat, alt);
      const fi = rec.anim.length > 1 ? Math.floor(now / 60) % rec.anim.length : 0;
      if (fi !== rec.frame) {
        if (rec.frame >= 0) rec.anim[rec.frame].show = false;
        rec.frame = fi;
        rec.anim[fi].show = true;
      }
      const b = rec.anim[fi];
      b.position = pos;
      b.rotation = -C.Math.toRadians(rec.fix.track);
      if (rec === this.selected) b.color = C.Color.fromCssColorString("#7cf");
      else b.color = C.Color.WHITE;
      rec.label.position = pos;
      rec.label.show = this.showLabels || rec === this.selected;
      if (rec.poly) rec.poly.show = true;
      rec.pos = pos;
    }
  }

  dispose(rec, keepTrail = false) {
    if (rec.anim) rec.anim.forEach((b) => this.bbs.remove(b));
    if (rec.label) this.labels.remove(rec.label);
    if (!keepTrail && rec.poly) { this.trails.remove(rec.poly); rec.poly = null; }
    rec.anim = null;
    rec.label = null;
  }

  get(hex) { return this.map.get(hex); }
  counts() {
    let mil = 0, civ = 0;
    for (const r of this.map.values()) r.mil ? mil++ : civ++;
    return { mil, civ };
  }
  setLabels(v) { this.showLabels = v; }
  setMil(v) { this.showMil = v; }
  setCivil(v) { this.showCivil = v; }
}
