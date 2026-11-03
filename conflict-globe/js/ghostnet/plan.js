// GhostNet v1.5 communications plan (S2 Underground) as structured data.
// Source: https://github.com/s2underground/GhostNet ("GhostNet_Version_1.5.pdf"
// schedule pages and the "ghostnet-codeplug" ALE config).
// GhostNet © 2024-2025 S2 Underground, licensed CC BY-NC-SA 4.0
// (https://creativecommons.org/licenses/by-nc-sa/4.0/). Non-commercial use only.

export const GHOSTNET_ATTRIBUTION = "GhostNet v1.5 © S2 Underground, CC BY-NC-SA 4.0";
export const GHOSTNET_URL = "https://github.com/s2underground/GhostNet";

const DAY = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// The standard weekly net: JS8 check-ins, Winlink P2P, RTTY blind bursts,
// and an emergency-only voice window, all on 40 m.
function weeklyNet(net, region, day, startHour) {
  const h = (n) => String(startHour + Math.floor(n / 60)).padStart(2, "0") + String(n % 60).padStart(2, "0");
  return [
    { net, region, day, start: h(0), end: h(30), mode: "JS8Call", khz: 7107, band: "40m", note: "Check-ins, POSREPs, message traffic. Monitor @GHOSTNET and @GSTFLASH." },
    { net, region, day, start: h(30), end: h(60), mode: "Winlink P2P (VARA HF)", khz: 7107, band: "40m", note: "Peer-to-peer email exchange between designated stations." },
    { net, region, day, start: h(60), end: h(90), mode: "RTTY 45.45 Bd", khz: 7077, band: "40m", note: "Short blind bursts for stations that missed check-in." },
    { net, region, day, start: h(90), end: h(120), mode: "HF voice (LSB)", khz: 7190, band: "40m", note: "Dire emergency only — not a standard net." },
  ];
}

/** All comm windows, times in UTC. */
export const WINDOWS = [
  // GhostNet North America: Thursday night local = Friday 0100Z.
  ...weeklyNet("GhostNet North America", "NA", DAY.fri, 1),
  ...weeklyNet("GhostNet Europe", "EUR", DAY.thu, 18),
  ...weeklyNet("GhostNet Australia", "AUS", DAY.thu, 7),
  // Saturday data bridges.
  { net: "NA–Europe Data Bridge", region: "NA/EUR", day: DAY.sat, start: "1800", end: "1900", mode: "JS8Call", khz: 14107, band: "20m" },
  { net: "NA–Europe Data Bridge", region: "NA/EUR", day: DAY.sat, start: "1900", end: "2000", mode: "Ion2G ALE", khz: null, band: "ALE", note: "Point-to-point links; see ALE channel plan." },
  { net: "NA–Australia Data Bridge", region: "NA/AUS", day: DAY.sat, start: "1200", end: "1300", mode: "JS8Call", khz: 14107, band: "20m" },
  { net: "NA–Australia Data Bridge", region: "NA/AUS", day: DAY.sat, start: "1300", end: "1330", mode: "Ion2G ALE", khz: null, band: "ALE" },
  { net: "NA–Australia Data Bridge", region: "NA/AUS", day: DAY.sat, start: "1330", end: "1400", mode: "JS8Call", khz: 3575, band: "80m" },
  { net: "Europe–Australia Data Bridge", region: "EUR/AUS", day: DAY.sat, start: "2000", end: "2100", mode: "JS8Call", khz: 14107, band: "20m" },
  { net: "Europe–Australia Data Bridge", region: "EUR/AUS", day: DAY.sat, start: "2100", end: "2130", mode: "Ion2G ALE", khz: null, band: "ALE" },
  { net: "Europe–Australia Data Bridge", region: "EUR/AUS", day: DAY.sat, start: "2130", end: "2200", mode: "JS8Call", khz: 3575, band: "80m" },
  { net: "Australia–South Pacific Data Bridge", region: "AUS/PAC", day: DAY.sat, start: "0800", end: "0900", mode: "JS8Call", khz: 14107, band: "20m" },
  { net: "Australia–South Pacific Data Bridge", region: "AUS/PAC", day: DAY.sat, start: "0900", end: "0930", mode: "JS8Call", khz: 7107, band: "40m" },
  { net: "Australia–South Pacific Data Bridge", region: "AUS/PAC", day: DAY.sat, start: "0930", end: "1000", mode: "Ion2G ALE", khz: null, band: "ALE" },
];

/** JS8Call dial frequencies used by GhostNet (kHz). JS8 signals sit 0–3 kHz above dial. */
export const JS8_DIALS = [
  { khz: 3575, band: "80m", use: "Data bridges" },
  { khz: 7107, band: "40m", use: "Weekly GhostNet nets (non-standard JS8 frequency)" },
  { khz: 14107, band: "20m", use: "Data bridges" },
];

export const OTHER_FREQS = [
  { khz: 7077, mode: "RTTY 45.45 Bd", use: "Blind bursts" },
  { khz: 7190, mode: "Voice LSB", use: "Emergency only" },
];

/** ALE channel plan from ghostnet-codeplug: [name, kHz, network]. All USB. */
export const ALE_CHANNELS = [
  ["GHOSTNET01", 3598.5], ["GHOSTNET02", 7060.0], ["GHOSTNET03", 7106.5], ["GHOSTNET04", 7108.5], ["GHOSTNET05", 10128.5],
  ["GHOSTNET06", 14111.5], ["GHOSTNET07", 14113.5], ["GHOSTNET08", 14115.5], ["GHOSTNET09", 18108.5], ["GHOSTNET10", 28108.5],
  ["HFN01", 1843.0], ["HFN02", 3596.0], ["HFN03", 5357.0], ["HFN04", 7102.0], ["HFN05", 10145.0], ["HFN06", 14109.0],
  ["HFN07", 18106.0], ["HFN08", 21096.0], ["HFN09", 28146.0],
  ["HFL01", 1996.0], ["HFL02", 3996.0], ["HFL03", 5371.5], ["HFL04", 7296.0], ["HFL05", 14346.0], ["HFL06", 18117.5],
  ["HFL07", 21432.5], ["HFL08", 28312.5],
].map(([name, khz]) => ({ name, khz, network: name.replace(/\d+$/, "") }));

/** HFN ALE net member addresses from hfn-ale-net.csv (slot 1 SELFADDR omitted). */
export const HFN_MEMBERS = new Set(["KM4BA", "KQ6XA", "WA3MEZ", "K7EK", "VE2FXL", "NJ7C", "WD8ARZ", "WB4AKK", "N0PWZ"]);

export const GROUPS = [
  ["@GHOSTNET", "General group for routine messages"],
  ["@GSTFLASH", "Emergency FLASH traffic — relay at once"],
  ["@GN<CCC><SS>", "Regional group, e.g. @GNUSASC = South Carolina, USA"],
];

// ------------------------------------------------------------------ time helpers
function minutesOfWeek(day, hhmm) {
  return day * 1440 + Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(2));
}

function windowRange(w) {
  const s = minutesOfWeek(w.day, w.start);
  let e = minutesOfWeek(w.day, w.end === "2400" ? "2359" : w.end) + (w.end === "2400" ? 1 : 0);
  if (e <= s) e += 1440;
  return [s, e];
}

/** Windows active at `date` (UTC). */
export function activeWindows(date = new Date()) {
  const now = date.getUTCDay() * 1440 + date.getUTCHours() * 60 + date.getUTCMinutes();
  return WINDOWS.filter((w) => {
    const [s, e] = windowRange(w);
    return (now >= s && now < e) || (now + 10080 >= s && now + 10080 < e);
  }).map((w) => ({ ...w, endsIn: minutesUntil(date, w, "end") }));
}

function minutesUntil(date, w, which) {
  const now = date.getUTCDay() * 1440 + date.getUTCHours() * 60 + date.getUTCMinutes();
  const [s, e] = windowRange(w);
  const t = which === "end" ? e : s;
  return (((t - now) % 10080) + 10080) % 10080;
}

/** The next `n` windows to start after `date`, soonest first. */
export function upcomingWindows(date = new Date(), n = 6) {
  return WINDOWS.map((w) => ({ ...w, startsIn: minutesUntil(date, w, "start") }))
    .filter((w) => w.startsIn > 0)
    .sort((a, b) => a.startsIn - b.startsIn)
    .slice(0, n);
}

export function fmtDuration(min) {
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

export function dayName(d) { return DAY_NAMES[d]; }

/** Match a reported frequency (Hz) to a GhostNet JS8 dial, if within the 3 kHz passband. */
export function matchJs8Dial(hz) {
  const khz = hz / 1000;
  return JS8_DIALS.find((d) => khz >= d.khz - 0.05 && khz <= d.khz + 3.05) || null;
}

// ------------------------------------------------------------------ Maidenhead grid
/** Maidenhead locator (2–8 chars) → [lat, lon] at the centre of the square. */
export function gridToLatLon(grid) {
  const g = (grid || "").trim().toUpperCase();
  if (!/^[A-R]{2}(\d{2}([A-X]{2}(\d{2})?)?)?$/.test(g)) return null;
  let lon = (g.charCodeAt(0) - 65) * 20 - 180, lat = (g.charCodeAt(1) - 65) * 10 - 90;
  let lonSz = 20, latSz = 10;
  if (g.length >= 4) { lon += Number(g[2]) * 2; lat += Number(g[3]); lonSz = 2; latSz = 1; }
  if (g.length >= 6) { lon += (g.charCodeAt(4) - 65) * (5 / 60); lat += (g.charCodeAt(5) - 65) * (2.5 / 60); lonSz = 5 / 60; latSz = 2.5 / 60; }
  if (g.length >= 8) { lon += Number(g[6]) * (0.5 / 60); lat += Number(g[7]) * (0.25 / 60); lonSz = 0.5 / 60; latSz = 0.25 / 60; }
  return [lat + latSz / 2, lon + lonSz / 2];
}
