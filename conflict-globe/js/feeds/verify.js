// Verification of machine-coded events against the language of their coverage.
//
// GDELT codes events automatically, so figurative language ("legal battle",
// "fight over the budget", "playoff clash", "attack on the policy") can
// produce combat codes. Each GDELT report carries its article URL, and news
// URLs usually contain the headline, so we read the headline words of every
// article covering an event and decide:
//
//   verified   — coverage uses unambiguous physical-violence terms
//                (killed, shelling, airstrike, gunmen, explosion…) and no
//                figurative/non-violent context in the same headline
//   filtered   — coverage reads as legal, political, sports, business,
//                health or entertainment news with no physical-violence terms
//   unverified — no evidence either way (no readable headline, foreign
//                language, or mixed signals such as "trial over shooting")
//
// Only verified events are animated. Words like "battle", "fight", "attack",
// "war", "strike", "clash" or "raid" are deliberately treated as WEAK: they
// never verify an event on their own.

// Strong physical-violence terms, each mapped to the action they describe.
const STRONG = {
  // drones
  drone: "drone", drones: "drone", uav: "drone", uavs: "drone", shahed: "drone", "drone-strike": "drone", "drone-attack": "drone",
  // air
  airstrike: "air", airstrikes: "air", "air-strike": "air", "air-strikes": "air", "air-raid": "air", warplane: "air", warplanes: "air",
  "fighter-jets": "air", bombers: "air", "aerial-bombardment": "air",
  // artillery / heavy weapons
  shelling: "armor", shelled: "armor", shells: "armor", artillery: "armor", howitzer: "armor", howitzers: "armor", mortar: "armor",
  mortars: "armor", tanks: "armor", "armored-vehicles": "armor", mlrs: "armor", himars: "armor",
  // explosives / missiles
  bomb: "bombing", bombs: "bombing", bombing: "bombing", bombings: "bombing", bombed: "bombing", explosion: "bombing", explosions: "bombing",
  blast: "bombing", blasts: "bombing", ied: "bombing", "car-bomb": "bombing", "suicide-bomber": "bombing", "suicide-bombing": "bombing",
  grenade: "bombing", grenades: "bombing", missile: "bombing", missiles: "bombing", rocket: "bombing", rockets: "bombing",
  "missile-strike": "bombing", "rocket-attack": "bombing", explosives: "bombing", detonated: "bombing",
  // gunfire / ground combat
  shooting: "ground", shootings: "ground", gunmen: "ground", gunman: "ground", gunfire: "ground", gunfight: "ground", firefight: "ground",
  "shot-dead": "ground", "opened-fire": "ground", sniper: "ground", snipers: "ground", ambush: "ground", ambushed: "ground",
  gunshot: "ground", gunshots: "ground", "exchange-of-fire": "ground", "heavy-fighting": "ground", "armed-clashes": "ground",
  // naval
  warship: "naval", warships: "naval", "naval-blockade": "naval", frigate: "naval", destroyer: "naval",
  // mass violence
  massacre: "massviol", massacred: "massviol", "mass-killing": "massviol", "mass-grave": "massviol", "ethnic-cleansing": "massviol",
  // casualties / generic but unambiguous
  killed: null, kill: null, kills: null, killing: null, slain: null, "gunned-down": null, injures: null, injuring: null,
  wounding: null, stabbed: null, stabbing: null, dead: null, deaths: null, dies: null, died: null, wounded: null, injured: null, casualties: null,
  fatalities: null, "death-toll": null, kidnapped: null, abducted: null, hostages: null, assassinated: null, assassination: null,
  militants: null, insurgents: null, jihadists: null, troops: null, soldiers: null, offensive: null, invasion: null, besieged: null,
};

// HARD figurative frames: these mean the article is about something other
// than violence happening now (a court case, a game, an idiom, an anniversary),
// even if violence words also appear ("trial over police shooting").
const HARD_FIGURATIVE = new Set([
  "lawsuit", "lawsuits", "trial", "verdict", "sued", "sues", "indictment", "indicted", "plea", "jury", "prosecutors", "testimony",
  "subpoena", "litigation", "injunction", "sentenced", "sentencing", "acquitted", "convicted", "supreme-court", "court-ruling",
  "legal-battle", "court-battle", "custody-battle", "legal-fight", "court-fight", "uphill-battle",
  "nfl", "nba", "mlb", "nhl", "mls", "ufc", "mma", "playoff", "playoffs", "touchdown", "quarterback", "goalkeeper", "innings",
  "olympics", "esports", "video-game", "box-office", "movie", "film", "trailer", "album", "oscars", "grammys", "netflix", "episode",
  "documentary", "anniversary", "commemorate", "commemoration", "memorial", "remembering", "years-ago", "years-after", "decades-after",
  "war-of-words", "culture-war", "trade-war", "price-war", "bidding-war", "heart-attack", "panic-attack", "asthma-attack",
  "think-tank", "cyberattack", "cyber-attack", "ransomware", "data-breach", "hackers", "war-on-drugs", "war-on-poverty",
]);

// SOFT figurative context: common in non-violent news, but also appear in real
// incident headlines ("market bombing", "rescue team"), so they only count
// when the headline has no physical-violence terms at all.
const SOFT_FIGURATIVE = new Set([
  "legal", "court", "courts", "judge", "judges", "appeal", "appeals", "ruling", "attorney", "attorneys", "lawyer", "lawyers",
  "custody", "divorce", "settlement", "hearing",
  "election", "elections", "campaign", "ballot", "vote", "votes", "voters", "polls", "primary", "senate", "congress", "parliament",
  "lawmakers", "bill", "budget", "policy", "legislation", "referendum", "candidate", "debate", "zoning", "council", "mayor",
  "governor", "impeachment", "filibuster", "nomination", "cabinet", "battle-over", "fight-over", "fight-against",
  "tariff", "tariffs", "inflation", "market", "markets", "stocks", "shares", "earnings", "prices", "economy", "rates", "merger",
  "takeover", "acquisition", "ceo", "startup", "investors", "revenue", "profit", "ipo", "union", "unions", "workers", "labor",
  "labour", "wages", "contract", "negotiations",
  "game", "games", "match", "matches", "season", "league", "cup", "championship", "finals", "coach", "team", "soccer", "football",
  "basketball", "baseball", "hockey", "tennis", "golf", "boxing", "boxer", "wrestling", "tournament", "striker", "derby",
  "rivalry", "score", "fixture",
  "cancer", "disease", "covid", "virus", "vaccine", "health", "diagnosis", "patients", "stroke",
  "series", "song", "award", "awards", "review", "celebrity", "concert", "tour", "fans", "gaming",
]);

// URL sections / domains that indicate non-physical news when the headline is silent.
const FIGURATIVE_SECTIONS = new Set(["sport", "sports", "business", "markets", "money", "finance", "entertainment", "arts", "culture",
  "lifestyle", "style", "celebrity", "music", "movies", "tv", "health", "science", "tech", "technology", "games", "gaming", "opinion",
  "law", "legal", "courts", "elections", "personal-finance", "real-estate", "travel", "food", "fashion"]);
const FIGURATIVE_DOMAINS = ["espn.", "bleacherreport.", "si.com", "cbssports.", "skysports.", "goal.com", "nfl.com", "nba.com", "mlb.com",
  "variety.com", "hollywoodreporter.", "deadline.com", "billboard.com", "law360.", "abovethelaw.", "bloomberglaw.", "marketwatch.",
  "fool.com", "investing.com", "seekingalpha."];

const WEAK = new Set(["battle", "battles", "fight", "fights", "fighting", "attack", "attacks", "attacked", "war", "wars", "strike",
  "strikes", "clash", "clashes", "raid", "raids", "conflict", "violence", "assault", "shot", "fire", "siege", "occupy", "occupation"]);

/** Extract readable headline words from an article URL. */
export function urlWords(url) {
  let u;
  try { u = new URL(url); } catch { return { words: [], sections: [], headline: "", host: "" }; }
  const segs = u.pathname.split("/").map((s) => decodeURIComponent(s).toLowerCase().replace(/\.(s?html?|php|aspx?|amp|cms)$/, ""));
  const sections = segs.filter((s) => /^[a-z-]+$/.test(s) && s.split("-").length <= 2);
  // The headline slug is the segment with the most words.
  let slug = "";
  for (const s of segs) {
    const n = s.split(/[-_+]/).filter((w) => /[a-z]/.test(w)).length;
    if (n >= 3 && n > slug.split(/[-_+]/).length - 1) slug = s;
  }
  const words = slug.split(/[^a-z0-9']+/).filter((w) => w && !/^\d+$/.test(w) && !/^[a-z]?\d+[a-z0-9]*$/.test(w));
  return { words, sections, headline: words.join(" "), host: u.hostname.replace(/^www\./, "") };
}

function terms(words) {
  // Single words plus 2- and 3-word phrases joined with "-".
  const out = [...words];
  for (let i = 0; i < words.length - 1; i++) out.push(`${words[i]}-${words[i + 1]}`);
  for (let i = 0; i < words.length - 2; i++) out.push(`${words[i]}-${words[i + 1]}-${words[i + 2]}`);
  return out;
}

/** Assess one article URL. */
export function assessUrl(url) {
  const { words, sections, headline, host } = urlWords(url);
  const t = terms(words);
  const strong = [], hard = [], soft = [], weak = [];
  for (const term of t) {
    if (Object.prototype.hasOwnProperty.call(STRONG, term)) strong.push(term);
    if (HARD_FIGURATIVE.has(term)) hard.push(term);
    if (SOFT_FIGURATIVE.has(term)) soft.push(term);
    if (WEAK.has(term)) weak.push(term);
  }
  // Phrases override their parts: "heart-attack" is not an attack, "think-tank" not a tank.
  const figPhrases = hard.filter((f) => f.includes("-"));
  const strongClean = strong.filter((s) => !figPhrases.some((f) => f.split("-").includes(s)));
  const context = sections.filter((s) => FIGURATIVE_SECTIONS.has(s)).concat(FIGURATIVE_DOMAINS.some((d) => host.includes(d)) ? [host] : []);
  let kind;
  if (!words.length) kind = context.length ? "figurative" : "neutral";
  else if (strongClean.length && hard.length) kind = "mixed";
  else if (strongClean.length) kind = "kinetic";
  else if (hard.length || soft.length || context.length) kind = "figurative";
  else kind = "neutral";
  return { url, kind, strong: strongClean, fig: kind === "mixed" ? hard : [...hard, ...soft, ...context], weak, headline };
}

const CAT_PRIORITY = ["drone", "air", "armor", "naval", "massviol", "bombing", "ground"];

/** Assess an event from all its coverage. */
export function assessEvent(urls) {
  const per = urls.map(assessUrl);
  const kinetic = per.filter((a) => a.kind === "kinetic");
  const figurative = per.filter((a) => a.kind === "figurative");
  const mixed = per.filter((a) => a.kind === "mixed");
  const evidence = [...new Set(kinetic.flatMap((a) => a.strong))];
  const counterEvidence = [...new Set([...figurative, ...mixed].flatMap((a) => a.fig))];
  // Category suggested by the strongest specific term in the coverage.
  const cats = new Set(evidence.map((w) => STRONG[w]).filter(Boolean));
  const evidenceCat = CAT_PRIORITY.find((c) => cats.has(c)) || null;
  const headlines = per.filter((a) => a.headline).map((a) => ({ text: a.headline, url: a.url, kind: a.kind }));

  let status, reason;
  if (kinetic.length) {
    status = "verified";
    reason = `Coverage describes physical violence: ${evidence.slice(0, 6).join(", ")}.`;
  } else if (figurative.length && !mixed.length && figurative.length >= per.filter((a) => a.kind === "neutral" && a.headline).length) {
    status = "filtered";
    reason = `Coverage reads as non-violent news (${counterEvidence.slice(0, 5).join(", ")}); the combat coding is likely figurative language.`;
  } else if (mixed.length) {
    status = "unverified";
    reason = `Coverage mixes violence terms with ${counterEvidence.slice(0, 4).join(", ")} — possibly reporting on a past incident (e.g. a trial or inquiry).`;
  } else {
    status = "unverified";
    reason = headlines.length ? "Coverage headlines contain no unambiguous physical-violence terms." : "No readable headline in the coverage URLs.";
  }
  return { status, reason, evidence, counterEvidence, evidenceCat, headlines: headlines.slice(0, 6) };
}
