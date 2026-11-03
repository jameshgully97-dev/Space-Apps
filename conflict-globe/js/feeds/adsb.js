// Live aircraft from community ADS-B aggregators (readsb v2 JSON schema).
//  * military: global feed of aircraft flagged military in the aggregator DB
//  * nearby:   every transponder within 250 nm of the camera when zoomed in
// Note: many military flights over active conflict zones do not broadcast,
// so the absence of aircraft is not evidence of absence of air activity.

import { ENDPOINTS, REFRESH } from "../config.js";
import { smartFetch } from "../net.js";

export class AircraftFeed {
  constructor({ onData, onStatus, getCameraPoint }) {
    this.onData = onData;
    this.onStatus = onStatus;
    this.getCameraPoint = getCameraPoint;
    this.provider = 0;
    this.enabled = { mil: true, nearby: true };
    this.timers = [];
  }

  start() {
    const loop = (fn, ms) => { fn(); this.timers.push(setInterval(fn, ms)); };
    loop(() => this.enabled.mil && this.poll("mil"), REFRESH.militaryAircraftMs);
    loop(() => this.enabled.nearby && this.poll("nearby"), REFRESH.nearbyAircraftMs);
  }

  stop() { this.timers.forEach(clearInterval); }

  async poll(kind) {
    let url;
    const tryProviders = ENDPOINTS.aircraftProviders.length;
    for (let attempt = 0; attempt < tryProviders; attempt++) {
      const p = ENDPOINTS.aircraftProviders[(this.provider + attempt) % tryProviders];
      if (kind === "mil") url = p.mil;
      else {
        const cam = this.getCameraPoint();
        if (!cam || cam.height > 2.5e6) { this.onStatus(kind, { state: "idle", text: "zoom in to load" }); return; }
        url = p.point(cam.lat, cam.lon, 250);
      }
      try {
        const json = await smartFetch(url, { timeout: 12000 });
        this.provider = (this.provider + attempt) % tryProviders;
        const list = (json.ac || json.aircraft || []).filter((a) => typeof a.lat === "number" && typeof a.lon === "number");
        const now = json.now ? (json.now > 1e12 ? json.now : json.now * 1000) : Date.now();
        if (kind === "mil") list.forEach((a) => (a._mil = true));
        this.onData(kind, list, now, p);
        this.onStatus(kind, { state: "ok", text: `${list.length} via ${p.name}`, at: Date.now() });
        return;
      } catch (e) {
        if (attempt === tryProviders - 1) this.onStatus(kind, { state: "error", text: e.message });
      }
    }
  }
}
