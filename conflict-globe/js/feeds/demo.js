// Offline demonstration data. Clearly flagged as SIMULATED in the UI; used
// when the user turns on demo mode (e.g. no network / presentation).

const HOTSPOTS = [
  ["Simulated · Region A", 48.0, 37.8], ["Simulated · Region B", 47.1, 37.5], ["Simulated · Region C", 31.4, 34.4],
  ["Simulated · Region D", 15.5, 32.5], ["Simulated · Region E", 33.5, 36.3], ["Simulated · Region F", 21.0, 96.0],
  ["Simulated · Region G", 13.5, 2.1], ["Simulated · Region H", -1.7, 29.2], ["Simulated · Region I", 15.4, 44.2],
  ["Simulated · Region J", 50.5, 36.2],
];
const CATS = [["ground", "193"], ["armor", "194"], ["air", "195"], ["drone", "1952"], ["bombing", "183"], ["mobilize", "154"], ["massviol", "202"], ["naval", "191"]];
const TITLES = { ground: "Small arms / light weapons fighting", armor: "Artillery and tank fighting", air: "Aerial weapons", drone: "Remotely piloted aerial munitions", bombing: "Bombing", mobilize: "Forces mobilized", massviol: "Mass killings", naval: "Blockade" };

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function demoEvents() {
  const r = rng(42);
  const now = Date.now();
  const events = [];
  let n = 0;
  for (const [place, lat, lon] of HOTSPOTS) {
    const count = 6 + Math.floor(r() * 18);
    for (let i = 0; i < count; i++) {
      const [cat, code] = CATS[Math.floor(r() * CATS.length)];
      const t = now - Math.floor(r() * 3 * 3600e3);
      const fr = r();
      const force = fr < 0.45 ? "military" : fr < 0.65 ? "armed" : fr < 0.85 ? "police" : "unattributed";
      events.push({
        key: `demo${n}`, id: `demo${n++}`, cat, code, force, targets: [], title: TITLES[cat] + " (SIMULATED)",
        lat: lat + (r() - 0.5) * 2.2, lon: lon + (r() - 0.5) * 2.8, place, country: "", precision: 4,
        actors: [], urls: [], reports: 1 + Math.floor(r() * 9), mentions: 1, first: t, last: t, source: "DEMO",
      });
    }
  }
  return events;
}

export function demoAircraft() {
  const r = rng(7);
  const types = [["F16", "VIPER"], ["C17", "RCH"], ["K35R", "QID"], ["Q9", "FORTE"], ["H60", "DUSTOF"], ["EUFI", "TARTN"], ["B52", "DOOM"], ["A400", "RRR"], ["P8", "NAVY"], ["RQ4", "FORTE"]];
  const list = [];
  for (let i = 0; i < 40; i++) {
    const [, lat, lon] = HOTSPOTS[i % HOTSPOTS.length];
    const [t, cs] = types[i % types.length];
    list.push({
      hex: "de" + (1000 + i).toString(16), flight: `${cs}${10 + i}`, t, r: `SIM-${i}`, _mil: true, _demo: true,
      lat: lat + (r() - 0.5) * 6, lon: lon + (r() - 0.5) * 6,
      alt_baro: t === "H60" ? 1500 : 18000 + Math.floor(r() * 18000), gs: t === "H60" ? 120 : 280 + r() * 200,
      track: r() * 360, squawk: "7777".replace(/7/g, () => Math.floor(r() * 8)),
    });
  }
  return list;
}

/** Simulated GhostNet JS8 reception reports (callsigns are fictitious "SIM" calls). */
export function demoRadioReports() {
  const r = rng(99);
  const grids = ["FN31", "EM73", "DM79", "CN87", "EN52", "FM18", "EL29", "DN70", "JO62", "IO91", "JN58", "KO85", "QF56", "QF22", "PF95", "RF73"];
  const dials = [[7107, "40m"], [14107, "20m"], [3575, "80m"]];
  const out = [];
  const now = Date.now();
  for (let i = 0; i < 160; i++) {
    const a = grids[Math.floor(r() * grids.length)], b = grids[Math.floor(r() * grids.length)];
    if (a === b) continue;
    const [khz, band] = dials[Math.floor(r() * (r() < 0.6 ? 1 : 3))];
    const sq = (g) => g + String.fromCharCode(65 + Math.floor(r() * 24)) + String.fromCharCode(65 + Math.floor(r() * 24));
    out.push({ tx: `SIM${Math.floor(r() * 40)}`, txGrid: sq(a), rx: `SIMRX${Math.floor(r() * 60)}`, rxGrid: sq(b), hz: khz * 1000 + 800 + Math.floor(r() * 2000), dial: khz, band, snr: Math.round(-24 + r() * 30), time: now - Math.floor(r() * 3600e3) });
  }
  return out;
}
