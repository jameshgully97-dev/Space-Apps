// GhostNet radio activity: stations heard on GhostNet JS8Call frequencies
// (from PSKReporter) and the HF paths between transmitter and receiver,
// drawn as arcs rising toward the ionosphere.

import { gridToLatLon, HFN_MEMBERS } from "../ghostnet/plan.js";
import { radioSprite } from "../sprites.js";

const C = window.Cesium;
export const BAND_COLORS = { "80m": "#4cc9f0", "40m": "#9ef01a", "20m": "#ffd23f" };
const MAX_LINKS = 1500;

function arc(a, b, segments = 24) {
  // Great-circle interpolation with a height bump proportional to distance.
  const ca = C.Cartographic.fromDegrees(a[1], a[0]), cb = C.Cartographic.fromDegrees(b[1], b[0]);
  const geo = new C.EllipsoidGeodesic(ca, cb);
  const dist = geo.surfaceDistance || 0;
  const peak = Math.min(350000, 60000 + dist * 0.08);
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const f = i / segments;
    const p = geo.interpolateUsingFraction(f);
    pts.push(C.Cartesian3.fromRadians(p.longitude, p.latitude, Math.sin(Math.PI * f) * peak));
  }
  return pts;
}

export class RadioLayer {
  constructor(viewer) {
    this.viewer = viewer;
    const scene = viewer.scene;
    this.links = scene.primitives.add(new C.PolylineCollection());
    this.bbs = scene.primitives.add(new C.BillboardCollection({ scene }));
    this.labels = scene.primitives.add(new C.LabelCollection({ scene }));
    this.stations = new Map();
    this.visible = true;
    scene.preRender.addEventListener(() => this.animate());
  }

  setReports(reports) {
    this.links.removeAll();
    this.bbs.removeAll();
    this.labels.removeAll();
    this.stations.clear();
    const touch = (call, grid, role, r) => {
      const ll = gridToLatLon(grid);
      if (!call || !ll) return null;
      let s = this.stations.get(call);
      if (!s) {
        s = { call, grid, lat: ll[0], lon: ll[1], heardBy: new Set(), heard: new Set(), bands: new Set(), last: 0, bestSnr: null, tx: false, member: HFN_MEMBERS.has(call.split("/")[0]) };
        this.stations.set(call, s);
      }
      if (grid.length > s.grid.length) { s.grid = grid; [s.lat, s.lon] = ll; }
      s.bands.add(r.band);
      s.last = Math.max(s.last, r.time);
      if (role === "tx") { s.tx = true; s.heardBy.add(r.rx); if (r.snr !== null && (s.bestSnr === null || r.snr > s.bestSnr)) s.bestSnr = r.snr; s.lastHz = r.hz; }
      else s.heard.add(r.tx);
      return s;
    };
    const seenLink = new Set();
    const sorted = [...reports].sort((a, b) => b.time - a.time);
    for (const r of sorted) {
      const tx = touch(r.tx, r.txGrid, "tx", r);
      const rx = touch(r.rx, r.rxGrid, "rx", r);
      if (!tx || !rx || tx === rx) continue;
      const key = `${r.tx}>${r.rx}`;
      if (seenLink.has(key) || seenLink.size >= MAX_LINKS) continue;
      seenLink.add(key);
      const age = (Date.now() - r.time) / 3600e3;
      this.links.add({
        positions: arc([tx.lat, tx.lon], [rx.lat, rx.lon]),
        width: 1.6,
        material: C.Material.fromType("Color", { color: C.Color.fromCssColorString(BAND_COLORS[r.band]).withAlpha(Math.max(0.15, 0.7 - age * 0.5)) }),
      });
    }
    for (const s of this.stations.values()) {
      const pos = C.Cartesian3.fromDegrees(s.lon, s.lat, 0);
      s.bb = this.bbs.add({
        position: pos,
        image: radioSprite(s.tx ? (BAND_COLORS[[...s.bands][0]] || "#fff") : "#9aa7b4", s.member),
        width: s.tx ? 26 : 16, height: s.tx ? 26 : 16,
        scaleByDistance: new C.NearFarScalar(5e4, 1.2, 1.5e7, 0.55),
        disableDepthTestDistance: 2e6,
        id: { kind: "radio", call: s.call },
      });
      if (s.tx) {
        s.label = this.labels.add({
          position: pos, text: s.call,
          font: "600 22px system-ui, 'Segoe UI', sans-serif", scale: 0.5,
          fillColor: C.Color.fromCssColorString("#d9f7c0"), outlineColor: C.Color.BLACK, outlineWidth: 5,
          style: C.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new C.Cartesian2(14, -10),
          horizontalOrigin: C.HorizontalOrigin.LEFT,
          distanceDisplayCondition: new C.DistanceDisplayCondition(0, 3.5e6),
          disableDepthTestDistance: 2e6,
          id: { kind: "radio", call: s.call },
        });
      }
      s.phase = Math.random();
    }
    this.setVisible(this.visible);
  }

  animate() {
    if (!this.visible) return;
    const t = performance.now() / 1800;
    const now = Date.now();
    for (const s of this.stations.values()) {
      if (!s.tx || now - s.last > 15 * 60e3) continue; // pulse stations heard in the last 15 min
      const p = (t + s.phase) % 1;
      s.bb.scale = 1 + 0.35 * Math.sin(p * Math.PI);
    }
  }

  setVisible(v) {
    this.visible = v;
    this.links.show = this.bbs.show = this.labels.show = v;
  }

  get(call) { return this.stations.get(call); }

  summary() {
    const byBand = { "80m": 0, "40m": 0, "20m": 0 };
    let tx = 0, recent = 0;
    const now = Date.now();
    for (const s of this.stations.values()) {
      if (!s.tx) continue;
      tx++;
      if (now - s.last < 15 * 60e3) recent++;
      for (const b of s.bands) byBand[b]++;
    }
    return { tx, recent, byBand, total: this.stations.size };
  }
}
