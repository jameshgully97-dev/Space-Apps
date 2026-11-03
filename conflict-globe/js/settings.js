// Persistent user settings (API keys, toggles). Browser storage may be
// unavailable (private mode), so every access is guarded.

const KEY = "conflict-globe.settings.v1";

const DEFAULTS = {
  googleKey: "",
  ionToken: "",
  proxyUrl: "",
  historyHours: 3,
  minSources: 1,
  showLabels: true,
  showMilAir: true,
  showNearbyAir: true,
  showEvents: true,
  showUnits: true,
  showBorders: true,
  showRadio: true,
  demo: false,
  hiddenCats: [],
};

let state = { ...DEFAULTS };
try {
  state = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
} catch { /* storage unavailable */ }

const listeners = new Set();

export const settings = {
  get: (k) => state[k],
  set(k, v) {
    state[k] = v;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
    for (const fn of listeners) fn(k, v);
  },
  onChange: (fn) => listeners.add(fn),
};

// URL overrides, e.g. ?demo=1 or ?google=KEY, handy for kiosk shortcuts.
const qs = new URLSearchParams(location.search);
if (qs.has("demo")) state.demo = qs.get("demo") !== "0";
if (qs.has("google")) state.googleKey = qs.get("google");
if (qs.has("ion")) state.ionToken = qs.get("ion");
