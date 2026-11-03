// National kit for animated figures and vehicles: what actually identifies a
// side in the field — camouflage pattern, helmet and vehicle colour, flag
// patch, identification armband. Colours are stylised approximations.
//
// Deliberately NOT included: skin tone or facial features by country. Every
// military is multi-ethnic, so figures get a varied mix of skin tones chosen
// independently of nationality (see skinTone()).
//
// Keys are the CAMEO / ISO-3166 alpha-3 country codes GDELT uses.

const F = {
  h: (...c) => ({ dir: "h", c }), // horizontal stripes, top → bottom
  v: (...c) => ({ dir: "v", c }), // vertical stripes, left → right
};

export const UNIFORMS = {
  USA: { name: "United States", pattern: "OCP (MultiCam-type)", camo: "multicam", base: "#b3a47c", spots: ["#867650", "#6c7a4e", "#d4c79e", "#5a4a33"], helmet: "#8c8160", vehicle: "#a99a6c", flag: { special: "usa" } },
  UKR: { name: "Ukraine", pattern: "MM-14 pixel", camo: "digital", base: "#6b6a4c", spots: ["#4e5939", "#8a7b5a", "#3b3b2e"], helmet: "#56593f", vehicle: "#525c3a", flag: F.h("#0057b7", "#ffd700"), band: "#ffd700" },
  RUS: { name: "Russia", pattern: "EMR pixel", camo: "digital", base: "#6c7457", spots: ["#4a5a3a", "#8b8061", "#2f3a2a"], helmet: "#4c5a3b", vehicle: "#4b5934", flag: F.h("#ffffff", "#0039a6", "#d52b1e"), band: "#f2f2f2" },
  ISR: { name: "Israel", pattern: "plain olive (madei alef)", camo: "plain", base: "#6a6b47", spots: [], helmet: "#5c5e41", vehicle: "#8c8a74", flag: { special: "isr" } },
  GBR: { name: "United Kingdom", pattern: "MTP", camo: "multicam", base: "#a29a72", spots: ["#6b6a45", "#4f4a33", "#c2b58a"], helmet: "#7d7650", vehicle: "#6f7350", flag: { special: "gbr" } },
  FRA: { name: "France", pattern: "CE woodland", camo: "woodland", base: "#7a7350", spots: ["#4c5233", "#3b2f22", "#9b8e63"], helmet: "#5f6243", vehicle: "#5d6445", flag: F.v("#0055a4", "#ffffff", "#ef4135") },
  DEU: { name: "Germany", pattern: "Flecktarn", camo: "fleck", base: "#7b7a5a", spots: ["#3d4a2c", "#5b4a33", "#2a2a22", "#8f8f5e"], helmet: "#5a5d41", vehicle: "#4d5538", flag: F.h("#000000", "#dd0000", "#ffce00") },
  POL: { name: "Poland", pattern: "wz. 93 Pantera", camo: "woodland", base: "#6f7151", spots: ["#3e4a2f", "#2b2a22", "#8c7d58"], helmet: "#545a3d", vehicle: "#4f5839", flag: F.h("#ffffff", "#dc143c") },
  CHN: { name: "China", pattern: "Type 07 digital", camo: "digital", base: "#5f6e4a", spots: ["#3f4f33", "#7f8a5c", "#2f3826"], helmet: "#4d5a3b", vehicle: "#536042", flag: { special: "chn" } },
  TWN: { name: "Taiwan", pattern: "digital woodland", camo: "digital", base: "#5f6a49", spots: ["#3c4730", "#7c7856", "#2c3124"], helmet: "#4c553b", vehicle: "#566044", flag: { special: "twn" } },
  PRK: { name: "North Korea", pattern: "plain olive-brown", camo: "plain", base: "#6b6440", spots: [], helmet: "#5a5638", vehicle: "#4e5434", flag: F.h("#024fa2", "#ed1c27", "#024fa2") },
  KOR: { name: "South Korea", pattern: "granite digital", camo: "digital", base: "#5e6650", spots: ["#3d4436", "#7d7a64", "#2b2e26"], helmet: "#4b5240", vehicle: "#525a44", flag: F.h("#ffffff", "#ffffff") },
  JPN: { name: "Japan", pattern: "Type II", camo: "woodland", base: "#6e6f4c", spots: ["#3f4a2e", "#5f4f37", "#8d8a60"], helmet: "#545a3d", vehicle: "#525d3e", flag: { special: "jpn" } },
  IND: { name: "India", pattern: "disruptive woodland", camo: "woodland", base: "#6f6b4a", spots: ["#454c32", "#5a4630", "#8b8560"], helmet: "#585b3e", vehicle: "#5c6443", flag: F.h("#ff9933", "#ffffff", "#138808") },
  PAK: { name: "Pakistan", pattern: "woodland", camo: "woodland", base: "#6c6a4b", spots: ["#3e4a30", "#5b4b33", "#8a8458"], helmet: "#55593d", vehicle: "#5a6042", flag: { special: "pak" } },
  IRN: { name: "Iran", pattern: "woodland", camo: "woodland", base: "#6e7150", spots: ["#3e4b31", "#5c4a34", "#8d8a60"], helmet: "#565b3e", vehicle: "#686a4c", flag: F.h("#239f40", "#ffffff", "#da0000") },
  TUR: { name: "Türkiye", pattern: "digital", camo: "digital", base: "#6a6a4f", spots: ["#454a35", "#86805d", "#2f3127"], helmet: "#555a40", vehicle: "#5a6146", flag: F.h("#e30a17", "#e30a17") },
  SYR: { name: "Syria", pattern: "woodland", camo: "woodland", base: "#6f6c4c", spots: ["#454b33", "#5b4a33", "#8c8660"], helmet: "#585b3f", vehicle: "#7a734f", flag: F.h("#007a3d", "#ffffff", "#000000") },
  IRQ: { name: "Iraq", pattern: "desert digital", camo: "digital", base: "#b4a27b", spots: ["#8d7b57", "#cdbd96", "#6f6347"], helmet: "#9c8d68", vehicle: "#a8976c", flag: F.h("#ce1126", "#ffffff", "#000000") },
  SAU: { name: "Saudi Arabia", pattern: "desert digital", camo: "digital", base: "#bba680", spots: ["#9a8661", "#d3c39e", "#7b6c4f"], helmet: "#a39268", vehicle: "#b09d74", flag: F.h("#006c35", "#006c35") },
  YEM: { name: "Yemen", pattern: "desert", camo: "woodland", base: "#a89670", spots: ["#7f6d4e", "#c4b48c", "#5f5440"], helmet: "#8e8060", vehicle: "#9c8c66", flag: F.h("#ce1126", "#ffffff", "#000000") },
  EGY: { name: "Egypt", pattern: "desert", camo: "woodland", base: "#b3a07a", spots: ["#8c7955", "#cbbb93", "#6c5f46"], helmet: "#9b8b66", vehicle: "#ad9b72", flag: F.h("#ce1126", "#ffffff", "#000000") },
  SDN: { name: "Sudan", pattern: "desert", camo: "woodland", base: "#ad9a73", spots: ["#867350", "#c6b68d", "#655a42"], helmet: "#958563", vehicle: "#a3916a", flag: F.h("#d21034", "#ffffff", "#000000") },
  ETH: { name: "Ethiopia", pattern: "woodland", camo: "woodland", base: "#6c6b4b", spots: ["#40492f", "#5a4931", "#8a8459"], helmet: "#55593d", vehicle: "#5a6143", flag: F.h("#078930", "#fcdd09", "#da121a") },
  NGA: { name: "Nigeria", pattern: "woodland", camo: "woodland", base: "#6b6c4b", spots: ["#3f4a2f", "#5a4a32", "#88835a"], helmet: "#55593d", vehicle: "#596143", flag: F.v("#008751", "#ffffff", "#008751") },
  COD: { name: "DR Congo", pattern: "woodland", camo: "woodland", base: "#6a6b4a", spots: ["#3e492e", "#594931", "#878259"], helmet: "#54583c", vehicle: "#586042", flag: F.h("#007fff", "#ce1021", "#f7d618") },
  MMR: { name: "Myanmar", pattern: "plain green", camo: "plain", base: "#5d6a45", spots: [], helmet: "#4d583a", vehicle: "#536043", flag: F.h("#fecb00", "#34b233", "#ea2839") },
};

const GENERIC = { name: "", pattern: "generic olive", camo: "plain", base: "#5f6b3f", spots: [], helmet: "#4a5632", vehicle: "#56633b", flag: null };

/** Kit for a country code, or a neutral generic kit when unknown. */
export function uniformFor(code) {
  return (code && UNIFORMS[code]) ? { key: code, ...UNIFORMS[code] } : { key: "GEN", ...GENERIC };
}

// Skin tones, assigned per figure at random — never by nationality.
export const SKIN_TONES = ["#f1c9a5", "#e3b28d", "#c98f66", "#a86e48", "#8a5536", "#5f3a24"];
export function skinTone(rand) {
  return Math.floor(rand() * SKIN_TONES.length);
}

/** Draw a small flag into a rectangle. */
export function drawFlag(ctx, flag, x, y, w, h) {
  if (!flag) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  if (flag.special) {
    const s = flag.special;
    const fill = (c, ...r) => { ctx.fillStyle = c; ctx.fillRect(...r); };
    if (s === "usa") { for (let i = 0; i < 7; i++) fill(i % 2 ? "#ffffff" : "#b22234", x, y + (i * h) / 7, w, h / 7 + 0.5); fill("#3c3b6e", x, y, w * 0.45, h * 0.55); }
    if (s === "gbr") { fill("#012169", x, y, w, h); fill("#ffffff", x, y + h * 0.38, w, h * 0.24); fill("#ffffff", x + w * 0.4, y, w * 0.2, h); fill("#c8102e", x, y + h * 0.43, w, h * 0.14); fill("#c8102e", x + w * 0.45, y, w * 0.1, h); }
    if (s === "isr") { fill("#ffffff", x, y, w, h); fill("#0038b8", x, y + h * 0.12, w, h * 0.14); fill("#0038b8", x, y + h * 0.74, w, h * 0.14); fill("#0038b8", x + w * 0.42, y + h * 0.4, w * 0.16, h * 0.2); }
    if (s === "chn") { fill("#de2910", x, y, w, h); fill("#ffde00", x + w * 0.12, y + h * 0.15, w * 0.18, h * 0.25); }
    if (s === "twn") { fill("#fe0000", x, y, w, h); fill("#000095", x, y, w * 0.5, h * 0.5); }
    if (s === "jpn") { fill("#ffffff", x, y, w, h); ctx.fillStyle = "#bc002d"; ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, h * 0.3, 0, 7); ctx.fill(); }
    if (s === "pak") { fill("#01411c", x, y, w, h); fill("#ffffff", x, y, w * 0.25, h); }
  } else {
    const n = flag.c.length;
    flag.c.forEach((col, i) => {
      ctx.fillStyle = col;
      if (flag.dir === "h") ctx.fillRect(x, y + (i * h) / n, w, h / n + 0.5);
      else ctx.fillRect(x + (i * w) / n, y, w / n + 0.5, h);
    });
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 0.8; ctx.strokeRect(x, y, w, h);
}

/** Paint a camouflage pattern over whatever is already drawn (source-atop). */
export function paintCamo(ctx, u, size, seed = 1) {
  if (!u.spots.length) return;
  let s = seed * 9973 + u.key.charCodeAt(0) * 131;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  const n = u.camo === "digital" ? 140 : u.camo === "fleck" ? 160 : 34;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = u.spots[Math.floor(r() * u.spots.length)];
    const x = r() * size, y = r() * size;
    if (u.camo === "digital") ctx.fillRect(Math.floor(x / 2) * 2, Math.floor(y / 2) * 2, 2 + Math.floor(r() * 2) * 2, 2);
    else if (u.camo === "fleck") { ctx.beginPath(); ctx.arc(x, y, 0.9 + r() * 1.1, 0, 7); ctx.fill(); }
    else { ctx.beginPath(); ctx.ellipse(x, y, 2 + r() * 4, 1.2 + r() * 2.5, r() * 3, 0, 7); ctx.fill(); }
  }
  ctx.restore();
}
