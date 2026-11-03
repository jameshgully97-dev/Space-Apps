// Central configuration: feed endpoints, refresh cadences, and the mappings
// from raw source codes (CAMEO event codes, ICAO aircraft type designators)
// to the animated unit kinds rendered on the globe.

export const CESIUM_VERSION = "1.135.0";

export const REFRESH = {
  gdeltPollMs: 5 * 60 * 1000, // GDELT publishes a new events file every 15 min
  militaryAircraftMs: 8000,
  nearbyAircraftMs: 8000,
  aircraftStaleMs: 75 * 1000,
};

export const ENDPOINTS = {
  gdeltLastUpdate: "http://data.gdeltproject.org/gdeltv2/lastupdate.txt",
  gdeltFile: (stamp) => `http://data.gdeltproject.org/gdeltv2/${stamp}.export.CSV.zip`,
  // readsb-compatible community ADS-B aggregators (same JSON schema). Tried in order.
  aircraftProviders: [
    {
      name: "adsb.lol",
      mil: "https://api.adsb.lol/v2/mil",
      point: (lat, lon, nm) => `https://api.adsb.lol/v2/point/${lat.toFixed(3)}/${lon.toFixed(3)}/${nm}`,
      link: (hex) => `https://adsb.lol/?icao=${hex}`,
    },
    {
      name: "airplanes.live",
      mil: "https://api.airplanes.live/v2/mil",
      point: (lat, lon, nm) => `https://api.airplanes.live/v2/point/${lat.toFixed(3)}/${lon.toFixed(3)}/${nm}`,
      link: (hex) => `https://globe.airplanes.live/?icao=${hex}`,
    },
  ],
};

// Hosts the bundled local server (server.ps1 / server.js) is allowed to proxy.
export const PROXY_HOSTS = [
  "data.gdeltproject.org",
  "api.gdeltproject.org",
  "api.adsb.lol",
  "api.airplanes.live",
];

// ---------------------------------------------------------------------------
// Conflict categories. Every reported event is mapped to one of these, which
// decides its marker colour and the animated units spawned when zoomed in.
// ---------------------------------------------------------------------------
export const CATEGORIES = {
  ground:   { label: "Ground combat / small arms", color: "#ff5a4f", glyph: "soldier" },
  armor:    { label: "Armor & artillery",          color: "#ff9f1c", glyph: "tank" },
  air:      { label: "Air strike",                 color: "#ffd23f", glyph: "jet" },
  drone:    { label: "Drone strike",               color: "#c77dff", glyph: "drone" },
  bombing:  { label: "Bombing / IED / shelling",   color: "#ff3d7f", glyph: "explosion" },
  massviol: { label: "Mass violence",              color: "#b5179e", glyph: "fire" },
  naval:    { label: "Naval / blockade",           color: "#4cc9f0", glyph: "ship" },
  mobilize: { label: "Troop mobilization",         color: "#9ef01a", glyph: "column" },
};

// CAMEO event code (GDELT) -> category. Longest prefix wins.
const CAMEO = [
  ["1952", "drone"],
  ["1951", "air"],
  ["195", "air"],
  ["194", "armor"],
  ["193", "ground"],
  ["196", "ground"],
  ["192", "mobilize"],
  ["191", "naval"],
  ["190", "ground"],
  ["19", "ground"],
  ["183", "bombing"],
  ["18", "bombing"],
  ["20", "massviol"],
  ["154", "mobilize"],
  ["152", "mobilize"],
  ["150", "mobilize"],
];

export function categoryForCameo(code) {
  for (const [prefix, cat] of CAMEO) if (code.startsWith(prefix)) return cat;
  return null;
}

export const CAMEO_NAMES = {
  "150": "Military show of force", "152": "Military alert raised", "154": "Armed forces mobilized",
  "180": "Unconventional violence", "181": "Abduction / hostage taking", "182": "Physical assault",
  "1821": "Sexual assault", "1822": "Torture", "1823": "Killing by physical assault",
  "183": "Bombing", "1831": "Suicide bombing", "1832": "Vehicular bombing", "1833": "Roadside bombing",
  "1834": "Location bombing", "184": "Use as human shield", "185": "Assassination attempt", "186": "Assassination",
  "190": "Conventional military force", "191": "Blockade", "192": "Occupation of territory",
  "193": "Small arms / light weapons fighting", "194": "Artillery and tank fighting",
  "195": "Aerial weapons", "1951": "Precision-guided aerial munitions", "1952": "Remotely piloted aerial munitions",
  "196": "Ceasefire violation", "200": "Unconventional mass violence", "201": "Mass expulsion",
  "202": "Mass killings", "203": "Ethnic cleansing", "204": "Weapons of mass destruction",
};

// ---------------------------------------------------------------------------
// ICAO aircraft type designator -> silhouette class.
// ---------------------------------------------------------------------------
const TYPE_CLASSES = {
  fighter: ["F15", "F16", "F18", "F18S", "F18H", "F22", "F35", "F35A", "F35B", "F35C", "EUFI", "RFAL", "GRIF", "TOR",
    "HAWK", "M2KC", "MIR2", "SU27", "SU30", "SU34", "SU35", "SU57", "MG29", "MG31", "J10", "J11", "JF17", "F14", "F5",
    "T38", "T7", "AJET", "A10", "AV8B", "L39", "M346", "KF21", "TEJS", "F4", "F2TH"],
  bomber: ["B52", "B1", "B2", "B21", "TU95", "TU22", "T160", "H6"],
  transport: ["C17", "C130", "C30J", "A400", "C5", "C5M", "C2", "AN12", "AN124", "AN22", "IL76", "Y20", "KC39", "C27J",
    "CN35", "C295", "C160", "P8", "P3", "E3TF", "E3CF", "E6", "E8", "E7", "R135", "RC35", "E2", "C12", "C40", "C32", "C37A", "C37B"],
  tanker: ["K35R", "KC135", "K35E", "KC10", "KC46", "A330", "A332", "MRTT", "A310", "IL78", "K46"],
  helicopter: ["H60", "UH60", "S70", "H64", "AH64", "H47", "CH47", "H53", "CH53", "H53S", "V22", "NH90", "EC35", "EC45",
    "EC55", "EC25", "EC30", "AS32", "AS50", "AS65", "LYNX", "WILD", "A139", "A169", "A189", "B06", "B407", "B412",
    "B429", "H1", "UH1", "AH1", "MI8", "MI24", "MI28", "KA52", "EH10", "TIGR", "PUMA", "R44", "R22", "S92"],
  drone: ["Q9", "MQ9", "Q4", "RQ4", "GLHK", "Q1", "MQ1", "TB2", "HRON", "WTCH", "MQ4", "Q25"],
};
const TYPE_LOOKUP = new Map();
for (const [cls, list] of Object.entries(TYPE_CLASSES)) for (const t of list) TYPE_LOOKUP.set(t, cls);

/** Pick the silhouette class for a readsb aircraft record. */
export function aircraftClass(ac) {
  const t = (ac.t || "").toUpperCase();
  if (TYPE_LOOKUP.has(t)) return TYPE_LOOKUP.get(t);
  for (const [prefix, cls] of TYPE_LOOKUP) if (prefix.length >= 3 && t.startsWith(prefix)) return cls;
  // ADS-B emitter category: A7 rotorcraft, B6 UAV, A1 light, A5 heavy
  switch (ac.category) {
    case "A7": return "helicopter";
    case "B6": return "drone";
    case "A1": case "A2": case "B1": return "light";
    default: break;
  }
  return isMilitary(ac) && !t ? "fighter" : "airliner";
}

export function isMilitary(ac) {
  return ((ac.dbFlags | 0) & 1) === 1 || ac._mil === true;
}
