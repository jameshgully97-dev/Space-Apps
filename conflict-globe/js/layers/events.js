// Event markers: one clustered billboard per (merged) reported event; markers
// reported within the last hour gently pulse. Clustering keeps
// the globe readable from orbit; markers fade out at street level where the
// animated units (units.js) take over.

import { CATEGORIES } from "../config.js";
import { markerSprite, clusterSprite } from "../sprites.js";

const C = window.Cesium;

export class EventLayer {
  constructor(viewer) {
    this.viewer = viewer;
    this.ds = new C.CustomDataSource("events");
    this.ds.clustering.enabled = true;
    this.ds.clustering.pixelRange = 38;
    this.ds.clustering.minimumClusterSize = 3;
    this.ds.clustering.clusterEvent.addEventListener((entities, cluster) => {
      const { canvas } = clusterSprite(entities.length);
      cluster.label.show = false;
      cluster.billboard.show = true;
      cluster.billboard.image = canvas;
      cluster.billboard.width = cluster.billboard.height = 30 + Math.min(26, Math.log2(entities.length) * 3.5);
      cluster.billboard.disableDepthTestDistance = 5e6;
      cluster.billboard.distanceDisplayCondition = new C.DistanceDisplayCondition(18000, Number.MAX_VALUE);
      cluster.billboard.id = cluster.billboard.id || { kind: "cluster" };
    });
    viewer.dataSources.add(this.ds);
    this.events = new Map();
    this.hidden = new Set();
    this.hiddenForces = new Set();
  }

  setEvents(list) {
    const seen = new Set();
    this.ds.entities.suspendEvents();
    for (const ev of list) {
      seen.add(ev.key);
      const existing = this.events.get(ev.key);
      if (existing) {
        Object.assign(existing.ev, ev);
        continue;
      }
      ev.force ||= "unattributed";
      const cat = CATEGORIES[ev.cat];
      const entity = this.ds.entities.add({
        position: C.Cartesian3.fromDegrees(ev.lon, ev.lat, 0),
        billboard: {
          image: markerSprite(ev.cat, cat.color, cat.glyph, ev.force),
          width: 30, height: 30,
          heightReference: C.HeightReference.CLAMP_TO_GROUND,
          scaleByDistance: new C.NearFarScalar(3e4, 1.15, 1.6e7, 0.6),
          distanceDisplayCondition: new C.DistanceDisplayCondition(18000, Number.MAX_VALUE),
          disableDepthTestDistance: 3e5,
          scale: new C.CallbackProperty(() => this.pulse(ev.key), false),
        },
        show: this.isShown(ev),
      });
      entity._cg = { kind: "event", key: ev.key };
      this.events.set(ev.key, { ev, entity, phase: Math.random() });
    }
    for (const [key, rec] of this.events) {
      if (!seen.has(key)) {
        this.ds.entities.remove(rec.entity);
        this.events.delete(key);
      }
    }
    this.ds.entities.resumeEvents();
  }

  pulse(key) {
    const rec = this.events.get(key);
    if (!rec || Date.now() - rec.ev.last > 3600e3) return 1;
    const p = (performance.now() / 1400 + rec.phase) % 1;
    return 1 + 0.28 * Math.sin(p * Math.PI);
  }

  isShown(ev) { return !this.hidden.has(ev.cat) && !this.hiddenForces.has(ev.force); }

  setHiddenCategories(set) {
    this.hidden = new Set(set);
    for (const rec of this.events.values()) rec.entity.show = this.isShown(rec.ev);
  }

  setHiddenForces(set) {
    this.hiddenForces = new Set(set);
    for (const rec of this.events.values()) rec.entity.show = this.isShown(rec.ev);
  }

  setVisible(v) {
    this.ds.show = v;
  }

  get(key) { return this.events.get(key)?.ev; }
  all() { return [...this.events.values()].map((r) => r.ev); }
}
