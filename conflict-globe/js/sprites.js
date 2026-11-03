// Procedurally drawn sprite frames. Everything is drawn on canvas at runtime,
// so the app ships with no image assets. Top-down sprites (vehicles, aircraft,
// ships) point north and are rotated by heading on the globe; side-view
// sprites (soldiers) are mirrored to face their direction of travel.

const S = 64;
const OUTLINE = "rgba(10,12,10,0.95)";

function canvas(size = S) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}

function shadow(ctx, x, y, rx, ry) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function stroked(ctx, fill, width = 2) {
  ctx.lineJoin = "round";
  ctx.lineWidth = width;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
}

function flash(ctx, x, y, r) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, "rgba(255,255,230,1)");
  g.addColorStop(0.35, "rgba(255,210,60,0.95)");
  g.addColorStop(1, "rgba(255,90,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// --------------------------------------------------------------- soldier
// 6-frame walk cycle + firing frame, side view, facing right.
function drawSoldier(frame, firing) {
  const c = canvas();
  const ctx = c.getContext("2d");
  const t = (frame / 6) * Math.PI * 2;
  const swing = firing ? 0.15 : Math.sin(t) * 0.55;
  const bob = firing ? 0 : Math.abs(Math.cos(t)) * 1.5;
  shadow(ctx, 32, 58, 12, 3);
  const hipX = 30, hipY = 38 - bob;
  const limb = (x, y, ang, len, w, col) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.roundRect(-w / 2, 0, w, len, w / 2);
    stroked(ctx, col, 1.6);
    ctx.restore();
  };
  // back leg, back arm
  limb(hipX, hipY, -swing, 18, 6, "#3d4a2a");
  if (!firing) limb(hipX + 1, hipY - 14, swing * 0.8, 13, 5, "#4b5a33");
  // torso + webbing
  ctx.beginPath();
  ctx.roundRect(hipX - 6, hipY - 17, 12, 19, 4);
  stroked(ctx, "#56663a", 1.8);
  ctx.fillStyle = "#2f3820";
  ctx.fillRect(hipX - 6, hipY - 9, 12, 3);
  // backpack
  ctx.beginPath();
  ctx.roundRect(hipX - 11, hipY - 16, 6, 12, 2);
  stroked(ctx, "#4a5530", 1.4);
  // front leg
  limb(hipX, hipY, swing, 18, 6, "#46542f");
  // head + helmet
  ctx.beginPath();
  ctx.arc(hipX + 1, hipY - 22, 5, 0, Math.PI * 2);
  stroked(ctx, "#c9a27a", 1.5);
  ctx.beginPath();
  ctx.ellipse(hipX + 1, hipY - 24, 7, 4.5, 0, Math.PI, 0);
  ctx.lineTo(hipX + 8, hipY - 23);
  ctx.closePath();
  stroked(ctx, "#3f4d2b", 1.5);
  // rifle (held across body, raised when firing)
  ctx.save();
  ctx.translate(hipX + 2, hipY - 12);
  ctx.rotate(firing ? -0.05 : 0.35 + swing * 0.1);
  ctx.fillStyle = "#1b1b1b";
  ctx.fillRect(-4, -2, 22, 3);
  ctx.fillRect(2, 0, 3, 5);
  if (firing) flash(ctx, 23, -0.5, 7);
  ctx.restore();
  // front arm
  limb(hipX + 2, hipY - 14, firing ? -1.35 : -0.9 - swing * 0.2, 12, 5, "#56663a");
  return c;
}

function mirror(src) {
  const c = canvas(src.width);
  const ctx = c.getContext("2d");
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return c;
}

// --------------------------------------------------------------- tank (top-down, north up)
function drawTank(frame, firing, recoil) {
  const c = canvas(S);
  const ctx = c.getContext("2d");
  shadow(ctx, 34, 36, 16, 22);
  // tracks with animated treads
  for (const x of [17, 41]) {
    ctx.beginPath();
    ctx.roundRect(x - 5, 12, 10, 42, 3);
    stroked(ctx, "#2b2b26", 1.6);
    ctx.fillStyle = "#555548";
    for (let y = 14 + (frame % 3) * 2; y < 52; y += 6) ctx.fillRect(x - 4, y, 8, 2);
  }
  // hull
  ctx.beginPath();
  ctx.roundRect(20, 14, 24, 38, 4);
  stroked(ctx, "#5b6b3c", 2);
  ctx.fillStyle = "#4c5a31";
  ctx.fillRect(22, 44, 20, 6);
  // turret
  const r = recoil ? 3 : 0;
  ctx.save();
  ctx.translate(32, 33 + r * 0.3);
  ctx.fillStyle = "#2a2a22";
  ctx.beginPath();
  ctx.roundRect(-1.8, -30 + r, 3.6, 24, 1.5);
  stroked(ctx, "#3a3f2a", 1.2);
  ctx.beginPath();
  ctx.ellipse(0, 0, 10, 11, 0, 0, Math.PI * 2);
  stroked(ctx, "#6a7a46", 2);
  ctx.beginPath();
  ctx.arc(3, 3, 3, 0, Math.PI * 2);
  ctx.fillStyle = "#3b4528";
  ctx.fill();
  if (firing) flash(ctx, 0, -31, 9);
  ctx.restore();
  return c;
}

// --------------------------------------------------------------- artillery (towed howitzer)
function drawArtillery(firing) {
  const c = canvas(S);
  const ctx = c.getContext("2d");
  shadow(ctx, 32, 40, 14, 16);
  // trails
  ctx.strokeStyle = "#2e3322";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(32, 36); ctx.lineTo(20, 58);
  ctx.moveTo(32, 36); ctx.lineTo(44, 58);
  ctx.stroke();
  // wheels
  for (const x of [20, 44]) {
    ctx.beginPath();
    ctx.roundRect(x - 3, 30, 6, 12, 2);
    stroked(ctx, "#222", 1.2);
  }
  // shield + barrel
  ctx.beginPath();
  ctx.roundRect(22, 30, 20, 8, 2);
  stroked(ctx, "#5f6e40", 1.6);
  ctx.beginPath();
  ctx.roundRect(30, firing ? 6 : 3, 4, 30, 1.5);
  stroked(ctx, "#3d452b", 1.2);
  if (firing) {
    flash(ctx, 32, 4, 12);
    ctx.fillStyle = "rgba(200,200,190,0.5)";
    ctx.beginPath(); ctx.arc(25, 8, 6, 0, 7); ctx.arc(40, 9, 5, 0, 7); ctx.fill();
  }
  return c;
}

// --------------------------------------------------------------- ship (top-down)
function drawShip(frame) {
  const c = canvas(S);
  const ctx = c.getContext("2d");
  // wake
  ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.2 * (frame % 2)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(28, 52); ctx.lineTo(20 - frame * 2, 64);
  ctx.moveTo(36, 52); ctx.lineTo(44 + frame * 2, 64);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(32, 2);
  ctx.quadraticCurveTo(42, 18, 40, 52);
  ctx.lineTo(24, 52);
  ctx.quadraticCurveTo(22, 18, 32, 2);
  stroked(ctx, "#7d8791", 2);
  ctx.beginPath(); ctx.roundRect(27, 22, 10, 14, 2); stroked(ctx, "#a9b2ba", 1.3);
  ctx.beginPath(); ctx.arc(32, 14, 3.5, 0, 7); stroked(ctx, "#5d6670", 1.2);
  ctx.fillStyle = "#3a4048"; ctx.fillRect(31, 6, 2, 8);
  ctx.beginPath(); ctx.arc(32, 44, 3, 0, 7); stroked(ctx, "#5d6670", 1.2);
  return c;
}

// --------------------------------------------------------------- explosion
function drawExplosion(frame, n) {
  const c = canvas(S);
  const ctx = c.getContext("2d");
  const p = frame / (n - 1); // 0..1
  const r = 6 + p * 24;
  // smoke
  ctx.fillStyle = `rgba(60,55,50,${0.75 * p})`;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4;
    ctx.beginPath();
    ctx.arc(32 + Math.cos(a) * r * 0.6, 32 + Math.sin(a) * r * 0.6 - p * 6, r * 0.45, 0, 7);
    ctx.fill();
  }
  // fireball
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, r);
  const alpha = 1 - p * 0.85;
  g.addColorStop(0, `rgba(255,255,220,${alpha})`);
  g.addColorStop(0.3, `rgba(255,200,50,${alpha})`);
  g.addColorStop(0.7, `rgba(240,80,10,${alpha * 0.85})`);
  g.addColorStop(1, "rgba(120,20,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rr = r * (i % 2 ? 0.78 : 1);
    ctx.lineTo(32 + Math.cos(a) * rr, 32 + Math.sin(a) * rr);
  }
  ctx.fill();
  // debris sparks
  ctx.fillStyle = `rgba(255,230,140,${alpha})`;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.fillRect(32 + Math.cos(a) * r * 1.15, 32 + Math.sin(a) * r * 1.15, 2, 2);
  }
  return c;
}

function drawFire(frame) {
  const c = canvas(S);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "rgba(40,36,34,0.55)";
  ctx.beginPath(); ctx.arc(34 + frame, 14 - frame, 10, 0, 7); ctx.arc(28 - frame, 8, 7, 0, 7); ctx.fill();
  for (let i = 0; i < 5; i++) {
    const x = 18 + i * 7;
    const h = 18 + ((i * 7 + frame * 5) % 13);
    const g = ctx.createLinearGradient(x, 56, x, 56 - h);
    g.addColorStop(0, "rgba(255,80,0,0.95)");
    g.addColorStop(0.6, "rgba(255,190,40,0.9)");
    g.addColorStop(1, "rgba(255,255,180,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - 6, 56);
    ctx.quadraticCurveTo(x - 4, 56 - h * 0.6, x + (frame % 2 ? 2 : -2), 56 - h);
    ctx.quadraticCurveTo(x + 4, 56 - h * 0.6, x + 6, 56);
    ctx.fill();
  }
  return c;
}

// --------------------------------------------------------------- aircraft (top-down, nose north)
function plane(kind, frame = 0, tint = "#d9dde2") {
  const size = kind === "bomber" || kind === "transport" || kind === "tanker" ? 80 : 64;
  const c = canvas(size);
  const ctx = c.getContext("2d");
  const k = size / 64;
  ctx.scale(k, k);
  ctx.beginPath();
  switch (kind) {
    case "fighter": // twin-tail swept-wing jet
      ctx.moveTo(32, 2); ctx.lineTo(35, 14); ctx.lineTo(35, 24); ctx.lineTo(58, 40); ctx.lineTo(58, 44);
      ctx.lineTo(36, 40); ctx.lineTo(37, 50); ctx.lineTo(46, 58); ctx.lineTo(46, 61); ctx.lineTo(34, 58);
      ctx.lineTo(32, 62); ctx.lineTo(30, 58); ctx.lineTo(18, 61); ctx.lineTo(18, 58); ctx.lineTo(27, 50);
      ctx.lineTo(28, 40); ctx.lineTo(6, 44); ctx.lineTo(6, 40); ctx.lineTo(29, 24); ctx.lineTo(29, 14);
      ctx.closePath(); stroked(ctx, tint === "#d9dde2" ? "#8f98a3" : tint, 2);
      ctx.fillStyle = "#3a6ea5"; ctx.beginPath(); ctx.ellipse(32, 15, 2, 5, 0, 0, 7); ctx.fill();
      break;
    case "bomber": // flying-wing
      ctx.moveTo(32, 14); ctx.lineTo(62, 40); ctx.lineTo(56, 44); ctx.lineTo(50, 40); ctx.lineTo(44, 46);
      ctx.lineTo(38, 40); ctx.lineTo(32, 46); ctx.lineTo(26, 40); ctx.lineTo(20, 46); ctx.lineTo(14, 40);
      ctx.lineTo(8, 44); ctx.lineTo(2, 40); ctx.closePath(); stroked(ctx, "#4a4f57", 2);
      break;
    case "transport": case "tanker": case "airliner": {
      const high = kind === "transport";
      // fuselage
      ctx.ellipse(32, 32, 4.5, 29, 0, 0, Math.PI * 2);
      stroked(ctx, kind === "transport" ? "#7c8578" : tint, 2);
      // wings
      ctx.beginPath();
      if (high) { ctx.moveTo(30, 22); ctx.lineTo(2, 27); ctx.lineTo(2, 31); ctx.lineTo(30, 30); ctx.lineTo(34, 30); ctx.lineTo(62, 31); ctx.lineTo(62, 27); ctx.lineTo(34, 22); }
      else { ctx.moveTo(29, 24); ctx.lineTo(3, 40); ctx.lineTo(4, 43); ctx.lineTo(29, 34); ctx.lineTo(35, 34); ctx.lineTo(60, 43); ctx.lineTo(61, 40); ctx.lineTo(35, 24); }
      ctx.closePath(); stroked(ctx, kind === "transport" ? "#6c7568" : tint, 1.8);
      // tailplane
      ctx.beginPath(); ctx.moveTo(30, 52); ctx.lineTo(18, 59); ctx.lineTo(18, 61); ctx.lineTo(32, 58); ctx.lineTo(46, 61); ctx.lineTo(46, 59); ctx.lineTo(34, 52); ctx.closePath();
      stroked(ctx, kind === "transport" ? "#6c7568" : tint, 1.5);
      // engines
      ctx.fillStyle = "#2c2f33";
      const eng = high ? [[12, 25], [22, 24], [42, 24], [52, 25]] : [[18, 33], [46, 33]];
      for (const [x, y] of eng) { ctx.beginPath(); ctx.roundRect(x - 2, y - 3, 4, 8, 1.5); ctx.fill(); }
      if (kind === "tanker") { ctx.strokeStyle = "#222"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(32, 61); ctx.lineTo(32, 64); ctx.stroke(); }
      break;
    }
    case "drone": // long straight wings, V-tail
      ctx.ellipse(32, 30, 3.5, 20, 0, 0, Math.PI * 2); stroked(ctx, "#9aa0a6", 1.8);
      ctx.beginPath(); ctx.moveTo(31, 26); ctx.lineTo(1, 28); ctx.lineTo(1, 31); ctx.lineTo(31, 31); ctx.lineTo(33, 31); ctx.lineTo(63, 31); ctx.lineTo(63, 28); ctx.lineTo(33, 26); ctx.closePath();
      stroked(ctx, "#9aa0a6", 1.6);
      ctx.beginPath(); ctx.moveTo(31, 46); ctx.lineTo(22, 54); ctx.lineTo(24, 55); ctx.lineTo(32, 49); ctx.lineTo(40, 55); ctx.lineTo(42, 54); ctx.lineTo(33, 46); ctx.closePath();
      stroked(ctx, "#9aa0a6", 1.4);
      ctx.save(); ctx.translate(32, 51); ctx.rotate(frame * 1.2); ctx.fillStyle = "rgba(30,30,30,0.7)"; ctx.fillRect(-6, -1, 12, 2); ctx.restore();
      break;
    case "light":
      ctx.ellipse(32, 32, 3.5, 18, 0, 0, Math.PI * 2); stroked(ctx, tint, 1.8);
      ctx.beginPath(); ctx.roundRect(8, 24, 48, 6, 3); stroked(ctx, tint, 1.6);
      ctx.beginPath(); ctx.roundRect(22, 45, 20, 4, 2); stroked(ctx, tint, 1.4);
      break;
    case "helicopter": {
      ctx.ellipse(32, 30, 7, 12, 0, 0, Math.PI * 2); stroked(ctx, "#5c6b48", 2);
      ctx.beginPath(); ctx.roundRect(30.5, 38, 3, 20, 1.5); stroked(ctx, "#5c6b48", 1.4);
      ctx.fillStyle = "#2f4a66"; ctx.beginPath(); ctx.ellipse(32, 24, 4, 4, 0, 0, 7); ctx.fill();
      // main rotor (animated)
      ctx.save(); ctx.translate(32, 30); ctx.rotate((frame / 3) * (Math.PI / 2));
      ctx.fillStyle = "rgba(25,25,25,0.85)";
      for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.fillRect(-1.5, 0, 3, 28); }
      ctx.restore();
      ctx.strokeStyle = "rgba(20,20,20,0.25)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(32, 30, 28, 0, 7); ctx.stroke();
      ctx.save(); ctx.translate(34, 57); ctx.rotate(frame * 1.3); ctx.fillStyle = "#222"; ctx.fillRect(-1, -6, 2, 12); ctx.restore();
      break;
    }
  }
  return c;
}

// --------------------------------------------------------------- markers
const GLYPH_DRAW = {
  soldier: () => drawSoldier(1, false),
  tank: () => drawTank(0, false, false),
  jet: () => plane("fighter"),
  drone: () => plane("drone"),
  explosion: () => drawExplosion(2, 6),
  fire: () => drawFire(1),
  ship: () => drawShip(0),
  column: () => drawTank(0, false, false),
};

function drawMarker(color, glyph) {
  const c = canvas(64);
  const ctx = c.getContext("2d");
  ctx.beginPath();
  ctx.arc(32, 32, 26, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(12,14,18,0.82)";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.drawImage(GLYPH_DRAW[glyph](), 12, 12, 40, 40);
  return c;
}

function drawCluster(count) {
  const c = canvas(64);
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  g.addColorStop(0, "rgba(255,80,60,0.95)");
  g.addColorStop(1, "rgba(160,20,20,0.55)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(32, 32, 29, 0, 7); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${count > 999 ? 16 : 20}px system-ui, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(count > 9999 ? "9k+" : String(count), 32, 33);
  return c;
}

// --------------------------------------------------------------- registry
let cache = null;

/**
 * Returns { name: [{ id, canvas }] } — each entry is an animation with
 * one or more frames. Ids are stable so Cesium's texture atlas reuses them.
 */
export function sprites() {
  if (cache) return cache;
  const reg = {};
  const add = (name, frames) => (reg[name] = frames.map((cv, i) => ({ id: `${name}#${i}`, canvas: cv })));
  const walkR = [0, 1, 2, 3, 4, 5].map((f) => drawSoldier(f, false));
  add("soldierR", walkR);
  add("soldierL", walkR.map(mirror));
  add("soldierFireR", [drawSoldier(0, true)]);
  add("soldierFireL", [mirror(drawSoldier(0, true))]);
  add("tank", [0, 1, 2].map((f) => drawTank(f, false, false)));
  add("tankFire", [drawTank(0, true, true)]);
  add("artillery", [drawArtillery(false)]);
  add("artilleryFire", [drawArtillery(true)]);
  add("ship", [0, 1].map(drawShip));
  add("explosion", [0, 1, 2, 3, 4, 5].map((f) => drawExplosion(f, 6)));
  add("fire", [0, 1, 2].map(drawFire));
  for (const k of ["fighter", "bomber", "transport", "tanker", "airliner", "light"]) add(`ac_${k}`, [plane(k)]);
  add("ac_drone", [0, 1, 2].map((f) => plane("drone", f)));
  add("ac_helicopter", [0, 1, 2].map((f) => plane("helicopter", f)));
  add("ac_civil", [plane("airliner", 0, "#e8edf2")]);
  cache = reg;
  return reg;
}

const markerCache = new Map();
export function markerSprite(cat, color, glyph) {
  if (!markerCache.has(cat)) markerCache.set(cat, drawMarker(color, glyph));
  return markerCache.get(cat);
}
const clusterCache = new Map();
export function clusterSprite(count) {
  const bucket = count < 10 ? count : count < 100 ? Math.round(count / 5) * 5 : count < 1000 ? Math.round(count / 50) * 50 : Math.round(count / 500) * 500;
  if (!clusterCache.has(bucket)) clusterCache.set(bucket, drawCluster(bucket));
  return { canvas: clusterCache.get(bucket), label: bucket };
}

/** Small preview used by the legend. */
export function legendIcon(cat, color, glyph) {
  return markerSprite(cat, color, glyph).toDataURL();
}
