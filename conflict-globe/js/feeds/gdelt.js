// GDELT 2.0 Event Database feed. GDELT machine-codes worldwide news every
// 15 minutes into CAMEO events with a geolocated "action" point. We pull the
// raw export files, keep the conflict-related codes (CAMEO 15x/18x/19x/20x)
// and merge duplicate reports of the same event type at the same place.

import { ENDPOINTS, categoryForCameo, CAMEO_NAMES } from "../config.js";
import { smartFetch, unzipFirstFile } from "../net.js";
import { settings } from "../settings.js";

const COL = {
  id: 0, actor1: 6, actor1Country: 7, actor2: 16, root: 25, code: 26, base: 27, rootCode: 28,
  goldstein: 30, mentions: 31, sources: 32, articles: 33, tone: 34,
  geoType: 51, geoName: 52, geoCountry: 53, lat: 56, lon: 57, added: 59, url: 60,
};

function parseStamp(s) {
  return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12), +s.slice(12, 14));
}
function toStamp(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}00`;
}

/** Parse one GDELT export TSV into conflict event records. */
export function parseGdelt(tsv) {
  const out = [];
  for (const line of tsv.split("\n")) {
    if (!line) continue;
    const f = line.split("\t");
    if (f.length < 61) continue;
    const code = f[COL.code];
    const cat = categoryForCameo(code);
    if (!cat) continue;
    const geoType = +f[COL.geoType];
    if (geoType === 1 || !geoType) continue; // country centroid only — too imprecise to plot
    const lat = +f[COL.lat], lon = +f[COL.lon];
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) continue;
    out.push({
      id: f[COL.id], code, cat, lat, lon, geoType,
      place: f[COL.geoName], country: f[COL.geoCountry],
      actor1: f[COL.actor1], actor2: f[COL.actor2],
      sources: +f[COL.sources] || 1, mentions: +f[COL.mentions] || 1,
      goldstein: +f[COL.goldstein], tone: +f[COL.tone],
      time: parseStamp(f[COL.added]), url: f[COL.url],
    });
  }
  return out;
}

/** Merge reports of the same event type at (nearly) the same place. */
export function aggregate(records) {
  const groups = new Map();
  for (const r of records) {
    const key = `${r.lat.toFixed(2)},${r.lon.toFixed(2)},${r.code}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key, id: "g" + r.id, cat: r.cat, code: r.code, title: CAMEO_NAMES[r.code] || CAMEO_NAMES[r.code.slice(0, 3)] || `CAMEO ${r.code}`,
        lat: r.lat, lon: r.lon, place: r.place, country: r.country, precision: r.geoType,
        actors: new Set(), urls: new Set(), reports: 0, mentions: 0, first: r.time, last: r.time, source: "GDELT",
      };
      groups.set(key, g);
    }
    g.reports += 1;
    g.mentions += r.mentions;
    if (r.actor1) g.actors.add(r.actor1);
    if (r.actor2) g.actors.add(r.actor2);
    if (r.url && g.urls.size < 6) g.urls.add(r.url);
    g.first = Math.min(g.first, r.time);
    g.last = Math.max(g.last, r.time);
  }
  return [...groups.values()].map((g) => ({ ...g, actors: [...g.actors].slice(0, 6), urls: [...g.urls] }));
}

export class GdeltFeed {
  constructor({ onData, onStatus }) {
    this.onData = onData;
    this.onStatus = onStatus;
    this.files = new Map(); // stamp -> records[]
    this.timer = null;
    this.latest = null;
  }

  start() {
    this.tick();
    this.timer = setInterval(() => this.tick(), 5 * 60 * 1000);
  }

  stop() { clearInterval(this.timer); }

  async tick() {
    try {
      this.onStatus({ state: "loading", text: "checking for new GDELT file…" });
      const txt = await smartFetch(ENDPOINTS.gdeltLastUpdate, { type: "text" });
      const m = txt.match(/gdeltv2\/(\d{14})\.export\.CSV\.zip/);
      if (!m) throw new Error("unexpected lastupdate.txt");
      const latest = parseStamp(m[1]);
      this.latest = latest;
      const hours = settings.get("historyHours");
      const wanted = [];
      for (let t = latest; t > latest - hours * 3600e3; t -= 15 * 60e3) wanted.push(toStamp(t));
      for (const s of this.files.keys()) if (!wanted.includes(s)) this.files.delete(s);
      const missing = wanted.filter((s) => !this.files.has(s));
      let done = 0, failed = 0;
      const worker = async () => {
        while (missing.length) {
          const stamp = missing.shift();
          try {
            const zip = await smartFetch(ENDPOINTS.gdeltFile(stamp), { type: "bytes", timeout: 45000 });
            this.files.set(stamp, parseGdelt(await unzipFirstFile(zip)));
          } catch (e) {
            failed++;
            if (failed > 3 && done === 0) throw e;
          }
          done++;
          this.onStatus({ state: "loading", text: `loading news-reported events ${done}/${wanted.length}` });
          this.emit();
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      this.emit();
      this.onStatus({ state: "ok", text: `updated ${new Date(latest).toISOString().slice(11, 16)} UTC`, at: latest });
    } catch (e) {
      this.onStatus({ state: "error", text: e.message });
    }
  }

  emit() {
    const minSources = settings.get("minSources");
    const all = [];
    for (const recs of this.files.values()) all.push(...recs);
    const events = aggregate(all).filter((e) => e.reports >= minSources);
    this.onData(events);
  }
}
