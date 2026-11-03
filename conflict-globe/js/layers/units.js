// Animated unit groups. When the camera is close to a reported event, a small
// scene is spawned around it whose composition depends on the event type:
// soldiers trading fire, tanks manoeuvring, artillery firing, jets making
// strike passes, drones orbiting, ships patrolling, explosions and fires.
//
// IMPORTANT: these units are *symbolic* — they illustrate the type of the
// reported event at its reported location. The cast depends on WHO acted:
//   military     → soldiers, tanks, artillery, jets, drones, warships
//   armed group  → irregular fighters (no air force, no warships)
//   police       → police officers and patrol cars only
//   unattributed → no people or vehicles at all, only explosions / fire,
//                  so violence alone is never drawn as military activity. No public source publishes the
// live positions of individual soldiers or vehicles.

import { sprites } from "../sprites.js";

const C = window.Cesium;
const MAX_GROUPS = 32;
const SPAWN_RANGE = 1.0e5; // metres from camera
const UNIT_DDC = new C.DistanceDisplayCondition(0, 7e4);
const UNIT_SCALE = new C.NearFarScalar(1.5e3, 1.6, 7e4, 0.45);

function rng(seedStr) {
  let s = 2166136261;
  for (let i = 0; i < seedStr.length; i++) s = Math.imul(s ^ seedStr.charCodeAt(i), 16777619);
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** A stack of pre-loaded frames; exactly one billboard is shown at a time. */
class Anim {
  constructor(coll, frames, opts) {
    this.bbs = frames.map((f) => {
      const b = coll.add({ ...opts, show: false });
      b.setImage(f.id, f.canvas);
      return b;
    });
    this.cur = -1;
  }
  draw(frame, pos, rotation, color) {
    const i = ((frame % this.bbs.length) + this.bbs.length) % this.bbs.length;
    if (i !== this.cur) {
      if (this.cur >= 0) this.bbs[this.cur].show = false;
      this.cur = i;
      this.bbs[i].show = true;
    }
    const b = this.bbs[i];
    b.position = pos;
    if (rotation !== undefined) b.rotation = rotation;
    if (color) b.color = color;
  }
  hide() {
    if (this.cur >= 0) this.bbs[this.cur].show = false;
    this.cur = -1;
  }
  destroy(coll) { for (const b of this.bbs) coll.remove(b); }
}

const SIDE_B = new C.Color(1.0, 0.86, 0.72, 1);
const WHITE = C.Color.WHITE;
const scratch = new C.Cartesian3();

class Group {
  constructor(layer, ev) {
    this.layer = layer;
    this.ev = ev;
    this.r = rng(ev.key);
    this.units = [];
    this.effects = [];
    this.t = 0;
    this.ground = layer.sampleGround(ev.lon, ev.lat);
    this.frame = C.Transforms.eastNorthUpToFixedFrame(C.Cartesian3.fromDegrees(ev.lon, ev.lat, this.ground));
    this.axis = this.r() * Math.PI * 2; // orientation of the "front line"
    this.build();
  }

  anim(name, width, extra = {}) {
    const S = sprites();
    return new Anim(this.layer.coll, S[name], {
      width, height: width,
      scaleByDistance: UNIT_SCALE,
      distanceDisplayCondition: UNIT_DDC,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      id: { kind: "event", key: this.ev.key },
      ...extra,
    });
  }
  topDown(name, width) { return this.anim(name, width, { alignedAxis: C.Cartesian3.UNIT_Z }); }

  enu(e, n, u, result = scratch) {
    return C.Matrix4.multiplyByPoint(this.frame, C.Cartesian3.fromElements(e, n, u, result), result);
  }

  // ----------------------------------------------------------- unit factories
  soldier(side, cx, cn, style = this.style) {
    const r = this.r;
    const face = this.axis + (side ? Math.PI : 0);
    const u = {
      a: { R: this.anim(`${style}R`, 26), L: this.anim(`${style}L`, 26), FR: this.anim(`${style}FireR`, 26), FL: this.anim(`${style}FireL`, 26) },
      e: cx + (r() - 0.5) * 160, n: cn + (r() - 0.5) * 160, te: cx, tn: cn, mode: "walk", timer: r() * 4,
      color: side && style !== "police" ? SIDE_B : WHITE, cx, cn, face, phase: r() * 6,
    };
    u.update = (dt, t) => {
      u.timer -= dt;
      if (u.timer <= 0) {
        if (u.mode === "walk" && r() < 0.55) { u.mode = "fire"; u.timer = 1.2 + r() * 2; }
        else { u.mode = "walk"; u.timer = 2 + r() * 4; u.te = u.cx + (r() - 0.5) * 220; u.tn = u.cn + (r() - 0.5) * 220; }
      }
      let dirE = Math.sin(u.face);
      if (u.mode === "walk") {
        const de = u.te - u.e, dn = u.tn - u.n, d = Math.hypot(de, dn);
        if (d > 2) { const s = Math.min(d, 9 * dt); u.e += (de / d) * s; u.n += (dn / d) * s; dirE = de; }
      }
      const pos = this.enu(u.e, u.n, 2);
      const right = dirE >= 0;
      const show = (k, f) => { for (const key in u.a) if (key !== k) u.a[key].hide(); u.a[k].draw(f, pos, undefined, u.color); };
      if (u.mode === "fire" && Math.floor((t + u.phase) * 9) % 2 === 0) show(right ? "FR" : "FL", 0);
      else show(right ? "R" : "L", u.mode === "walk" ? Math.floor((t + u.phase) * 10) : 0);
    };
    return this.add(u);
  }

  tank(cx, cn, radius) {
    const r = this.r;
    const u = { a: { move: this.topDown("tank", 34), fire: this.topDown("tankFire", 34) }, w: (6 + r() * 5) / radius, ph: r() * 6.28, fireAt: 2 + r() * 5, fireT: 0 };
    u.update = (dt, t) => {
      const th = t * u.w + u.ph;
      const e = cx + radius * Math.cos(th), n = cn + radius * 0.55 * Math.sin(2 * th);
      const de = -radius * Math.sin(th), dn = radius * 1.1 * Math.cos(2 * th);
      const heading = Math.atan2(de, dn);
      const pos = this.enu(e, n, 2);
      u.fireAt -= dt;
      if (u.fireAt <= 0) {
        u.fireAt = 4 + r() * 6; u.fireT = 0.22;
        this.boom(e + Math.sin(heading) * 900, n + Math.cos(heading) * 900, 0.7);
      }
      if (u.fireT > 0) { u.fireT -= dt; u.a.move.hide(); u.a.fire.draw(0, pos, -heading); }
      else { u.a.fire.hide(); u.a.move.draw(Math.floor(t * 8), pos, -heading); }
    };
    return this.add(u);
  }

  artillery(cx, cn, toward) {
    const r = this.r;
    const u = { a: { idle: this.topDown("artillery", 30), fire: this.topDown("artilleryFire", 30) }, fireAt: 1 + r() * 4, fireT: 0 };
    u.update = (dt) => {
      const pos = this.enu(cx, cn, 2);
      u.fireAt -= dt;
      if (u.fireAt <= 0) {
        u.fireAt = 3.5 + r() * 4; u.fireT = 0.3;
        setTimeout(() => this.boom(Math.sin(toward) * (r() - 0.5) * 300, Math.cos(toward) * (r() - 0.5) * 300, 1.1), 1400);
      }
      if (u.fireT > 0) { u.fireT -= dt; u.a.idle.hide(); u.a.fire.draw(0, pos, -toward); }
      else { u.a.fire.hide(); u.a.idle.draw(0, pos, -toward); }
    };
    return this.add(u);
  }

  jet() {
    const r = this.r;
    const u = { a: { f: this.topDown("ac_fighter", 42) }, h: r() * 6.28, s: -9000, dropped: false };
    u.update = (dt) => {
      u.s += 260 * dt;
      if (u.s > 9000) { u.s = -9000; u.h = r() * 6.28; u.dropped = false; }
      if (!u.dropped && u.s > -300) {
        u.dropped = true;
        for (let i = 0; i < 3; i++) setTimeout(() => this.boom((r() - 0.5) * 350, (r() - 0.5) * 350, 1.3), 600 + i * 250);
      }
      u.a.f.draw(0, this.enu(Math.sin(u.h) * u.s, Math.cos(u.h) * u.s, 2400), -u.h);
    };
    return this.add(u);
  }

  drone() {
    const r = this.r;
    const R = 1600, u = { a: { d: this.topDown("ac_drone", 40) }, th: r() * 6.28, strikeAt: 4 + r() * 8 };
    u.update = (dt, t) => {
      u.th += (45 / R) * dt;
      u.strikeAt -= dt;
      if (u.strikeAt <= 0) { u.strikeAt = 10 + r() * 10; this.boom((r() - 0.5) * 400, (r() - 0.5) * 400, 1); }
      const e = R * Math.cos(u.th), n = R * Math.sin(u.th);
      const heading = Math.atan2(-Math.sin(u.th), Math.cos(u.th));
      u.a.d.draw(Math.floor(t * 12), this.enu(e, n, 1300), -heading);
    };
    return this.add(u);
  }

  ship(R, ph) {
    const u = { a: { s: this.topDown("ship", 40) }, th: ph };
    u.update = (dt, t) => {
      u.th += (7 / R) * dt;
      const heading = Math.atan2(-Math.sin(u.th), Math.cos(u.th));
      u.a.s.draw(Math.floor(t * 3), this.enu(R * Math.cos(u.th), R * Math.sin(u.th), 1), -heading);
    };
    return this.add(u);
  }

  fire(e, n) {
    const u = { a: { f: this.anim("fire", 34) }, ph: this.r() * 3 };
    u.update = (dt, t) => u.a.f.draw(Math.floor((t + u.ph) * 7), this.enu(e, n, 3));
    return this.add(u);
  }

  policeCar(cx, cn, radius) {
    const r = this.r;
    const u = { a: { c: this.topDown("policeCar", 28) }, w: (5 + r() * 4) / radius, ph: r() * 6.28, parked: r() < 0.4 };
    u.update = (dt, t) => {
      const th = u.parked ? u.ph : t * u.w + u.ph;
      const e = cx + radius * Math.cos(th), n = cn + radius * 0.6 * Math.sin(th);
      const heading = Math.atan2(-radius * Math.sin(th), radius * 0.6 * Math.cos(th));
      u.a.c.draw(Math.floor(t * 5), this.enu(e, n, 2), -heading);
    };
    return this.add(u);
  }

  column(count, spacing, { vehicle = "tank", style = this.style } = {}) {
    // A convoy (tanks / patrol cars, or none) with personnel, moving along a road.
    const L = 3200, v = 9, h = this.axis;
    for (let i = 0; i < count; i++) {
      const isVeh = vehicle && i % 3 === 0;
      const u = { a: isVeh ? { t: this.topDown(vehicle, 32) } : { R: this.anim(`${style}R`, 24), L: this.anim(`${style}L`, 24) }, off: i * spacing, lat: isVeh ? 0 : (i % 2 ? 22 : -22) };
      u.update = (dt, t) => {
        const s = ((t * v + u.off) % L) - L / 2;
        const e = Math.sin(h) * s + Math.cos(h) * u.lat, n = Math.cos(h) * s - Math.sin(h) * u.lat;
        const pos = this.enu(e, n, 2);
        const fade = Math.min(1, (L / 2 - Math.abs(s)) / 300);
        const col = WHITE.withAlpha(Math.max(0, fade));
        if (isVeh) u.a.t.draw(Math.floor(t * 8), pos, -h, col);
        else {
          const right = Math.sin(h) >= 0;
          u.a[right ? "L" : "R"].hide();
          u.a[right ? "R" : "L"].draw(Math.floor(t * 10 + i), pos, undefined, col);
        }
      };
      this.add(u);
    }
  }

  // ----------------------------------------------------------- effects
  boom(e, n, size = 1) {
    if (!this.layer.coll || this.dead) return;
    let fx = this.effects.find((f) => f.p >= 1);
    if (!fx) {
      if (this.effects.length >= 6) return;
      fx = { a: this.anim("explosion", 52), p: 1 };
      this.effects.push(fx);
    }
    Object.assign(fx, { p: 0, e, n, size });
  }

  add(u) { this.units.push(u); return u; }

  build() {
    const force = this.ev.force || "unattributed";
    this.style = force === "police" ? "police" : force === "armed" ? "fighter" : "soldier";
    if (force === "police") this.buildPolice();
    else if (force === "unattributed") this.buildUnattributed();
    else this.buildCombat(force);
    this.nextPeriodic = this.periodic ? this.r() * this.periodic : Infinity;
  }

  buildCombat(force) {
    const r = this.r, ax = this.axis, military = force === "military";
    const sideOff = (d) => [Math.sin(ax) * d, Math.cos(ax) * d];
    switch (this.ev.cat) {
      case "ground": {
        const [ae, an] = sideOff(-170), [be, bn] = sideOff(170);
        const n = 3 + Math.floor(r() * 3);
        for (let i = 0; i < n; i++) this.soldier(0, ae, an);
        for (let i = 0; i < n; i++) this.soldier(1, be, bn);
        break;
      }
      case "armor": {
        this.tank(...sideOff(-350), 260);
        if (military) this.tank(...sideOff(-200), 320);
        this.artillery(...sideOff(-1500), ax);
        for (let i = 0; i < 3; i++) this.soldier(1, ...sideOff(250));
        break;
      }
      // Only state militaries are drawn with combat jets and warships.
      case "air": if (military) this.jet(); this.fire(60, -40); this.periodic = military ? 0 : 3; break;
      case "drone": this.drone(); this.fire(-30, 20); break;
      case "bombing": this.fire(0, 0); if (r() < 0.6) this.fire(70, 40); this.periodic = 2.5; break;
      case "massviol": this.fire(0, 0); this.fire(-90, 60); this.fire(80, -50); this.periodic = 3.5;
        for (let i = 0; i < 3; i++) this.soldier(0, 0, 0); break;
      case "naval": if (military) { this.ship(1100, 0); this.ship(1500, 2.5); } this.periodic = 6; break;
      case "mobilize": this.column(12, 130, { vehicle: military ? "tank" : null }); break;
      default: this.soldier(0, 0, 0);
    }
  }

  buildPolice() {
    // Law enforcement only: officers on foot and patrol cars, no military kit.
    const r = this.r, cat = this.ev.cat;
    const officers = cat === "mobilize" ? 0 : 3 + Math.floor(r() * 3);
    for (let i = 0; i < officers; i++) this.soldier(i % 2, (r() - 0.5) * 120, (r() - 0.5) * 120, "police");
    this.policeCar(0, 0, 160);
    this.policeCar(40, -30, 260);
    if (cat === "mobilize") this.column(9, 150, { vehicle: "policeCar", style: "police" });
    if (cat === "bombing" || cat === "massviol") { this.fire(0, 0); this.periodic = cat === "bombing" ? 5 : 0; }
  }

  buildUnattributed() {
    // No identified armed actor: draw only the effects of violence, never
    // soldiers or military vehicles.
    const r = this.r;
    switch (this.ev.cat) {
      case "bombing": case "massviol": this.fire(0, 0); if (r() < 0.5) this.fire(60, -40); this.periodic = 3; break;
      case "air": case "drone": case "armor": this.fire(0, 0); this.periodic = 4; break;
      default: this.periodic = 0; // marker only
    }
  }

  update(dt) {
    this.t += dt;
    if (this.periodic) {
      this.nextPeriodic -= dt;
      if (this.nextPeriodic <= 0) { this.nextPeriodic = this.periodic * (0.5 + this.r()); this.boom((this.r() - 0.5) * 500, (this.r() - 0.5) * 500, 1.2); }
    }
    for (const u of this.units) u.update(dt, this.t);
    for (const fx of this.effects) {
      if (fx.p >= 1) { fx.a.hide(); continue; }
      fx.p += dt / 1.0;
      if (fx.p >= 1) { fx.a.hide(); continue; }
      fx.a.draw(Math.min(5, Math.floor(fx.p * 6)), this.enu(fx.e, fx.n, 6));
      fx.a.bbs[fx.a.cur].scale = fx.size;
    }
  }

  destroy() {
    this.dead = true;
    for (const u of this.units) for (const k in u.a) u.a[k].destroy(this.layer.coll);
    for (const fx of this.effects) fx.a.destroy(this.layer.coll);
  }
}

export class UnitLayer {
  constructor(viewer, getEvents) {
    this.viewer = viewer;
    this.getEvents = getEvents;
    this.coll = viewer.scene.primitives.add(new C.BillboardCollection({ scene: viewer.scene }));
    this.groups = new Map();
    this.enabled = true;
    this.hidden = new Set();
    this.hiddenForces = new Set();
    this.last = performance.now();
    this.nextSelect = 0;
    this.cartCache = new Map();
    viewer.scene.preRender.addEventListener(() => this.tick());
  }

  sampleGround(lon, lat) {
    const scene = this.viewer.scene;
    const carto = C.Cartographic.fromDegrees(lon, lat);
    let h;
    try {
      if (!scene.globe.show && scene.sampleHeightSupported) h = scene.sampleHeight(carto);
      else h = scene.globe.getHeight(carto);
    } catch { h = undefined; }
    return Number.isFinite(h) ? h : 0;
  }

  tick() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (now > this.nextSelect) { this.nextSelect = now + 1000; this.select(); }
    for (const g of this.groups.values()) g.update(dt);
  }

  select() {
    const cam = this.viewer.camera.positionWC;
    const height = this.viewer.camera.positionCartographic.height;
    const wanted = [];
    if (this.enabled && height < SPAWN_RANGE) {
      for (const ev of this.getEvents()) {
        if (this.hidden.has(ev.cat) || this.hiddenForces.has(ev.force)) continue;
        let p = this.cartCache.get(ev.key);
        if (!p) { p = C.Cartesian3.fromDegrees(ev.lon, ev.lat, 0); this.cartCache.set(ev.key, p); }
        const d = C.Cartesian3.distance(cam, p);
        if (d < SPAWN_RANGE) wanted.push([d, ev]);
      }
      wanted.sort((a, b) => a[0] - b[0]);
      wanted.length = Math.min(wanted.length, MAX_GROUPS);
    }
    const keep = new Set(wanted.map(([, ev]) => ev.key));
    for (const [key, g] of this.groups) if (!keep.has(key)) { g.destroy(); this.groups.delete(key); }
    for (const [, ev] of wanted) if (!this.groups.has(ev.key)) this.groups.set(ev.key, new Group(this, ev));
  }

  setEnabled(v) { this.enabled = v; this.select(); }
  setHiddenCategories(set) { this.hidden = new Set(set); this.select(); }
  setHiddenForces(set) { this.hiddenForces = new Set(set); this.select(); }
  get activeCount() { return this.groups.size; }
}
