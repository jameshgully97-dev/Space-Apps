// Procedurally drawn sprite frames. Everything is drawn on canvas at runtime,
// so the app ships with no image assets. Top-down sprites (vehicles, aircraft,
// ships) point north and are rotated by heading on the globe; side-view
// sprites (soldiers) are mirrored to face their direction of travel.

import { uniformFor, SKIN_TONES, drawFlag, paintCamo } from "./uniforms.js";

const S = 64;
const OUTLINE = "rgba(10,12,10,0.95)";

// Sprites are drawn in a 64-unit logical space but rasterised at the screen's
// pixel density (up to 2×) so icons stay crisp on high-DPI Windows displays.
// Billboards always set an explicit on-screen width/height, so the extra
// pixels only add sharpness, not size.
export const SPRITE_SCALE = Math.min(2, Math.max(1, Math.round((window.devicePixelRatio || 1) * 2) / 2));

function canvas(size = S) {
  const c = document.createElement("canvas");
  c.width = c.height = Math.round(size * SPRITE_SCALE);
  c.logical = size;
  const ctx = c.getContext("2d");
  ctx.scale(SPRITE_SCALE, SPRITE_SCALE); // later getContext() calls return this same, pre-scaled context
  ctx.imageSmoothingQuality = "high";
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

// --------------------------------------------------------------- figures
// 6-frame walk cycle + firing frame, side view, facing right. Styles give
// visibly different people: soldiers, irregular fighters, police officers.
const FIGURE = {
  soldier: { leg: "#3d4a2a", leg2: "#46542f", arm: "#4b5a33", torso: "#56663a", belt: "#2f3820", pack: "#4a5530", head: "#3f4d2b", cap: false, long: true },
  fighter: { leg: "#3a3631", leg2: "#4a443d", arm: "#5b5148", torso: "#6b5f52", belt: "#2a2622", pack: "#4f463d", head: "#1d1d1d", cap: false, long: true, scarf: true },
  police:  { leg: "#1b2740", leg2: "#22304f", arm: "#2a3b63", torso: "#2f4475", belt: "#111", pack: null, head: "#14203a", cap: true, long: false, vest: "#c8d400" },
};

/**
 * Draw one figure frame.
 *  style   soldier | fighter | police
 *  kit     national uniform from uniforms.js (soldiers / police patch), or null
 *  skin    index into SKIN_TONES — chosen per figure, never by nationality
 * Clothing is drawn on its own layer so camouflage only covers the uniform.
 */
function drawSoldier(frame, firing, style = "soldier", kit = null, skin = 2) {
  const st = { ...FIGURE[style] };
  if (style === "soldier" && kit) Object.assign(st, { leg: kit.base, leg2: kit.base, arm: kit.base, torso: kit.base, pack: kit.base, head: kit.helmet });
  const skinCol = SKIN_TONES[skin] || SKIN_TONES[2];
  const c = canvas();
  const ctx = c.getContext("2d");
  const cloth = canvas();          // uniform layer (camouflaged)
  const cx = cloth.getContext("2d");
  const front = canvas();          // front arm layer (camouflaged, drawn over the weapon)
  const fx = front.getContext("2d");
  const t = (frame / 6) * Math.PI * 2;
  const swing = firing ? 0.15 : Math.sin(t) * 0.55;
  const bob = firing ? 0 : Math.abs(Math.cos(t)) * 1.5;
  shadow(ctx, 32, 58, 12, 3);
  const hipX = 30, hipY = 38 - bob;
  const limb = (g, x, y, ang, len, w, col) => {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.beginPath();
    g.roundRect(-w / 2, 0, w, len, w / 2);
    stroked(g, col, 1.6);
    g.restore();
  };
  // --- uniform layer: back leg, back arm, pack, torso, front leg
  limb(cx, hipX, hipY, -swing, 18, 6, st.leg);
  if (!firing) limb(cx, hipX + 1, hipY - 14, swing * 0.8, 13, 5, st.arm);
  if (st.pack) { cx.beginPath(); cx.roundRect(hipX - 11, hipY - 16, 6, 12, 2); stroked(cx, st.pack, 1.4); }
  cx.beginPath(); cx.roundRect(hipX - 6, hipY - 17, 12, 19, 4); stroked(cx, st.torso, 1.8);
  limb(cx, hipX, hipY, swing, 18, 6, st.leg2);
  if (style === "soldier" && kit) paintCamo(cx, kit, 64, 1);
  // kit details that must not be camouflaged
  if (st.vest) { cx.fillStyle = st.vest; cx.fillRect(hipX - 5, hipY - 15, 10, 8); }
  cx.fillStyle = st.belt; cx.fillRect(hipX - 6, hipY - 7, 12, 3);
  ctx.drawImage(cloth, 0, 0, 64, 64);
  // flag patch on the shoulder (state forces and police only)
  if (kit?.flag && style !== "fighter") drawFlag(ctx, kit.flag, hipX - 4, hipY - 16, 7, 5);
  // --- head, then helmet / cap
  ctx.beginPath(); ctx.arc(hipX + 1, hipY - 22, 5, 0, Math.PI * 2); stroked(ctx, skinCol, 1.5);
  if (st.cap) {
    ctx.beginPath(); ctx.roundRect(hipX - 5, hipY - 30, 11, 5, 2); stroked(ctx, st.head, 1.4);
    ctx.fillStyle = "#111"; ctx.fillRect(hipX + 3, hipY - 26, 6, 2);
    ctx.fillStyle = "#e0c25a"; ctx.fillRect(hipX - 1, hipY - 29, 3, 2);
  } else {
    ctx.beginPath(); ctx.ellipse(hipX + 1, hipY - 24, 7, 4.5, 0, Math.PI, 0); ctx.lineTo(hipX + 8, hipY - 23); ctx.closePath();
    stroked(ctx, st.head, 1.5);
  }
  if (st.scarf) { ctx.fillStyle = "#7a2b2b"; ctx.fillRect(hipX - 3, hipY - 19, 9, 3); }
  // --- weapon: long gun for soldiers/fighters, sidearm for police
  ctx.save();
  ctx.translate(hipX + 2, hipY - 12);
  ctx.rotate(firing ? -0.05 : 0.35 + swing * 0.1);
  ctx.fillStyle = "#1b1b1b";
  if (st.long) { ctx.fillRect(-4, -2, 22, 3); ctx.fillRect(2, 0, 3, 5); }
  else if (firing) { ctx.fillRect(8, -2, 8, 3); ctx.fillRect(8, 0, 3, 4); }
  if (firing) flash(ctx, st.long ? 23 : 17, -0.5, st.long ? 7 : 5);
  ctx.restore();
  // --- front arm (+ identification armband, e.g. Ukrainian yellow / Russian white tape)
  const armAng = firing ? -1.35 : -0.9 - swing * 0.2;
  limb(fx, hipX + 2, hipY - 14, armAng, 12, 5, st.torso);
  if (style === "soldier" && kit) paintCamo(fx, kit, 64, 2);
  if (style === "soldier" && kit?.band) {
    fx.save(); fx.translate(hipX + 2, hipY - 14); fx.rotate(armAng);
    fx.fillStyle = kit.band; fx.fillRect(-2.5, 3, 5, 2.5);
    fx.restore();
  }
  ctx.drawImage(front, 0, 0, 64, 64);
  return c;
}

function mirror(src) {
  const L = src.logical;
  const c = canvas(L);
  const ctx = c.getContext("2d");
  ctx.translate(L, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0, L, L);
  return c;
}

// --------------------------------------------------------------- tank (top-down, north up)
function drawTank(frame, firing, recoil, kit = null) {
  const hull = kit?.vehicle || "#5b6b3c";
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
  stroked(ctx, hull, 2);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(22, 44, 20, 6);
  if (kit?.flag) drawFlag(ctx, kit.flag, 26, 45, 12, 6);
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
  stroked(ctx, hull, 2);
  ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fill();
  ctx.beginPath();
  ctx.arc(3, 3, 3, 0, Math.PI * 2);
  ctx.fillStyle = "#3b4528";
  ctx.fill();
  if (firing) flash(ctx, 0, -31, 9);
  ctx.restore();
  return c;
}

// --------------------------------------------------------------- artillery (towed howitzer)
function drawArtillery(firing, kit = null) {
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

// --------------------------------------------------------------- police car (top-down)
function drawPoliceCar(frame) {
  const c = canvas(S);
  const ctx = c.getContext("2d");
  shadow(ctx, 33, 34, 12, 22);
  ctx.beginPath(); ctx.roundRect(22, 10, 20, 44, 6); stroked(ctx, "#f2f4f7", 2);
  ctx.fillStyle = "#1f3f8f"; ctx.fillRect(22, 26, 20, 12);           // blue livery band
  ctx.fillStyle = "#2b3440"; ctx.beginPath(); ctx.roundRect(25, 15, 14, 7, 2); ctx.fill(); // windscreen
  ctx.beginPath(); ctx.roundRect(25, 44, 14, 5, 2); ctx.fill();        // rear window
  // light bar alternates red / blue
  const left = frame % 2 === 0;
  ctx.fillStyle = left ? "#ff2b2b" : "#5a1010"; ctx.fillRect(24, 23, 8, 3);
  ctx.fillStyle = left ? "#10205a" : "#2f6bff"; ctx.fillRect(32, 23, 8, 3);
  const glow = ctx.createRadialGradient(left ? 28 : 36, 24, 0, left ? 28 : 36, 24, 14);
  glow.addColorStop(0, left ? "rgba(255,40,40,0.55)" : "rgba(60,110,255,0.55)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(left ? 28 : 36, 24, 14, 0, 7); ctx.fill();
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

// Marker outline shape encodes WHO acted; the ring colour and glyph encode
// WHAT happened. Military = circle, armed group = diamond, police = shield,
// unattributed = dashed square with no combatant glyph.
function markerPath(ctx, force) {
  ctx.beginPath();
  switch (force) {
    case "armed": ctx.moveTo(32, 4); ctx.lineTo(60, 32); ctx.lineTo(32, 60); ctx.lineTo(4, 32); ctx.closePath(); break;
    case "police": ctx.moveTo(32, 4); ctx.lineTo(56, 12); ctx.lineTo(54, 36); ctx.quadraticCurveTo(48, 52, 32, 60); ctx.quadraticCurveTo(16, 52, 10, 36); ctx.lineTo(8, 12); ctx.closePath(); break;
    case "unattributed": ctx.roundRect(8, 8, 48, 48, 8); break;
    default: ctx.arc(32, 32, 26, 0, Math.PI * 2);
  }
}

function drawMarker(color, glyph, force = "military") {
  const c = canvas(64);
  const ctx = c.getContext("2d");
  markerPath(ctx, force);
  ctx.fillStyle = "rgba(12,14,18,0.82)";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = color;
  if (force === "unattributed") ctx.setLineDash([7, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
  if (force === "police") {
    ctx.drawImage(drawPoliceCar(0), 14, 13, 36, 36);
  } else if (force === "unattributed") {
    // No soldiers/vehicles: just a hazard mark, so nothing implies a military actor.
    ctx.fillStyle = color;
    ctx.font = "bold 30px system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("!", 32, 34);
  } else {
    const g = glyph === "soldier" && force === "armed" ? drawSoldier(1, false, "fighter") : GLYPH_DRAW[glyph]();
    ctx.drawImage(g, 12, 12, 40, 40);
  }
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

// --------------------------------------------------------------- national kit sets (built on demand)
const kitCache = new Map();
/**
 * Frames for a figure in a given national kit and skin tone, or a vehicle in
 * national colours. Returns { R, L, FR, FL } (figures) or { move, fire } (tank).
 */
export function kitSprites(kind, countryCode, skin = 0, style = "soldier") {
  const kit = uniformFor(countryCode);
  const key = `${kind}|${style}|${kit.key}|${skin}`;
  if (kitCache.has(key)) return kitCache.get(key);
  const id = (n) => `${key}|${n}`;
  let out;
  if (kind === "figure") {
    const walk = [0, 1, 2, 3, 4, 5].map((f) => drawSoldier(f, false, style, kit, skin));
    const fire = drawSoldier(0, true, style, kit, skin);
    const pack = (name, cvs) => cvs.map((c, i) => ({ id: id(name) + "#" + i, canvas: c }));
    out = { R: pack("R", walk), L: pack("L", walk.map(mirror)), FR: pack("FR", [fire]), FL: pack("FL", [mirror(fire)]) };
  } else {
    out = {
      move: [0, 1, 2].map((f, i) => ({ id: id("move") + "#" + i, canvas: drawTank(f, false, false, kit) })),
      fire: [{ id: id("fire"), canvas: drawTank(0, true, true, kit) }],
    };
  }
  out.kit = kit;
  kitCache.set(key, out);
  return out;
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
  for (const style of ["fighter", "police"]) {
    const walk = [0, 1, 2, 3, 4, 5].map((f) => drawSoldier(f, false, style));
    add(`${style}R`, walk);
    add(`${style}L`, walk.map(mirror));
    add(`${style}FireR`, [drawSoldier(0, true, style)]);
    add(`${style}FireL`, [mirror(drawSoldier(0, true, style))]);
  }
  add("policeCar", [0, 1].map(drawPoliceCar));
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
export function markerSprite(cat, color, glyph, force = "military") {
  const k = cat + "|" + force;
  if (!markerCache.has(k)) markerCache.set(k, drawMarker(color, glyph, force));
  return markerCache.get(k);
}

/** Neutral legend swatch for a force (shape only). */
export function forceIcon(force, color) {
  return drawMarker(color, "soldier", force).toDataURL();
}
const clusterCache = new Map();
export function clusterSprite(count) {
  const bucket = count < 10 ? count : count < 100 ? Math.round(count / 5) * 5 : count < 1000 ? Math.round(count / 50) * 50 : Math.round(count / 500) * 500;
  if (!clusterCache.has(bucket)) clusterCache.set(bucket, drawCluster(bucket));
  return { canvas: clusterCache.get(bucket), label: bucket };
}

/** Small preview used by the legend. */
export function legendIcon(cat, color, glyph, force = "military") {
  return markerSprite(cat, color, glyph, force).toDataURL();
}

// --------------------------------------------------------------- radio station (GhostNet)
const radioCache = new Map();
/** Radio mast with signal arcs; `member` adds a gold ring (known HFN ALE net address). */
export function radioSprite(color, member = false) {
  const key = color + member;
  if (radioCache.has(key)) return radioCache.get(key);
  const c = canvas(64);
  const ctx = c.getContext("2d");
  ctx.beginPath();
  ctx.arc(32, 32, 27, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(10,14,18,0.8)";
  ctx.fill();
  ctx.lineWidth = member ? 4 : 2.5;
  ctx.strokeStyle = member ? "#ffd700" : color;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  // mast
  ctx.beginPath();
  ctx.moveTo(32, 26); ctx.lineTo(24, 50); ctx.moveTo(32, 26); ctx.lineTo(40, 50); ctx.moveTo(27, 42); ctx.lineTo(37, 42);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(32, 24, 3.5, 0, Math.PI * 2); ctx.fill();
  // signal arcs
  ctx.lineWidth = 2.5;
  for (const r of [9, 15]) {
    ctx.beginPath(); ctx.arc(32, 24, r, -Math.PI * 0.85, -Math.PI * 0.15); ctx.stroke();
  }
  radioCache.set(key, c);
  return c;
}
