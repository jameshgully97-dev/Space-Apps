// Live JS8Call activity on GhostNet frequencies, from PSKReporter
// (https://pskreporter.info), which aggregates automatic reception reports
// from thousands of amateur radio receivers. Each report says "station R
// decoded station S on frequency F at time T", with Maidenhead locators.
//
// PSKReporter asks clients to query no more often than every 5 minutes.

import { smartFetch } from "../net.js";
import { matchJs8Dial } from "../ghostnet/plan.js";

export const PSK_QUERY = (seconds) =>
  `https://retrieve.pskreporter.info/query?mode=JS8&flowStartSeconds=-${seconds}&rronly=1&appcontact=conflict-globe`;
const POLL_MS = 5 * 60 * 1000;

/** Parse a PSKReporter XML response into GhostNet-frequency reports. */
export function parsePskXml(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("bad PSKReporter response");
  const out = [];
  for (const r of doc.getElementsByTagName("receptionReport")) {
    const hz = Number(r.getAttribute("frequency"));
    const dial = matchJs8Dial(hz);
    if (!dial) continue;
    out.push({
      tx: (r.getAttribute("senderCallsign") || "").toUpperCase(),
      txGrid: r.getAttribute("senderLocator") || "",
      rx: (r.getAttribute("receiverCallsign") || "").toUpperCase(),
      rxGrid: r.getAttribute("receiverLocator") || "",
      hz, dial: dial.khz, band: dial.band,
      snr: r.hasAttribute("sNR") ? Number(r.getAttribute("sNR")) : null,
      time: Number(r.getAttribute("flowStartSeconds")) * 1000,
    });
  }
  return out;
}

export class PskReporterFeed {
  constructor({ onData, onStatus }) {
    this.onData = onData;
    this.onStatus = onStatus;
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    this.poll();
    this.timer = setInterval(() => this.poll(), POLL_MS);
  }

  stop() { clearInterval(this.timer); this.timer = null; }

  async poll() {
    try {
      this.onStatus({ state: "loading", text: "querying PSKReporter…" });
      const xml = await smartFetch(PSK_QUERY(3600), { type: "text", timeout: 45000 });
      const reports = parsePskXml(xml);
      this.onData(reports);
      this.onStatus({ state: "ok", text: `${reports.length} reports in the last hour`, at: Date.now() });
    } catch (e) {
      this.onStatus({ state: "error", text: e.message });
    }
  }
}
