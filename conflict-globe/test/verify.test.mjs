// Headline verification checks. Run: node test/verify.test.mjs
import { assessUrl, assessEvent } from "../js/feeds/verify.js";

const cases = [
  ["https://www.nytimes.com/2026/11/03/nyregion/legal-battle-over-manhattan-zoning-heats-up.html", "figurative"],
  ["https://www.espn.com/nfl/story/_/id/123/giants-jets-battle-for-playoff-spot", "figurative"],
  ["https://www.reuters.com/world/middle-east/israeli-airstrike-kills-12-in-gaza-2026-11-03/", "kinetic"],
  ["https://www.bbc.com/news/articles/c4g7x9z1", "neutral"],
  ["https://apnews.com/article/police-shooting-trial-verdict-minneapolis-0a1b2c", "mixed"],
  ["https://www.cnn.com/2026/11/03/health/heart-attack-risk-study", "figurative"],
  ["https://www.ft.com/content/trade-war-escalates-as-tariffs-bite", "figurative"],
  ["https://example.com/think-tank-report-on-defense-spending", "figurative"],
  ["https://kyivindependent.com/russian-shelling-of-kharkiv-overnight-injures-five/", "kinetic"],
  ["https://www.aljazeera.com/news/2026/11/3/gunmen-attack-village-in-northern-nigeria", "kinetic"],
  ["https://www.foxnews.com/politics/senate-fight-over-budget-attack-ads", "figurative"],
  ["https://www.theguardian.com/world/2026/nov/03/drone-strike-hits-port-city", "kinetic"],
  ["https://www.dawn.com/news/2026/bomb-blast-at-crowded-market-kills-10", "kinetic"],
  ["https://www.bbc.com/news/world-12345/rescue-team-reaches-site-of-missile-strike", "kinetic"],
  ["https://www.nypost.com/2026/11/03/sports/knicks-battle-celtics-in-overtime-thriller", "figurative"],
  ["https://www.wsj.com/business/workers-strike-at-boeing-plant", "figurative"],
  ["https://www.cnn.com/2026/11/03/us/protesters-clash-with-police-in-portland", "neutral"],
  ["https://www.reuters.com/world/ten-years-after-paris-attacks-memorial-held", "figurative"],
  ["https://www.bbc.com/news/troops-occupy-border-town-after-heavy-fighting", "kinetic"],
  ["https://www.bbc.com/news/council-occupation-of-territory-dispute", "figurative"],
];

let fail = 0;
for (const [url, expected] of cases) {
  const got = assessUrl(url).kind;
  if (got !== expected) { fail++; console.log(`FAIL ${got} (expected ${expected}): ${url}`); }
}
const ev = (urls, status, cat) => {
  const a = assessEvent(urls);
  if (a.status !== status || (cat !== undefined && a.evidenceCat !== cat)) { fail++; console.log(`FAIL event ${a.status}/${a.evidenceCat}, expected ${status}/${cat}: ${urls}`); }
};
ev([cases[0][0]], "filtered");
ev([cases[2][0]], "verified", "air");
ev([cases[3][0], cases[8][0]], "verified", "armor"); // headline-less first article, verified via a second outlet
ev([cases[4][0]], "unverified");
ev([cases[3][0]], "unverified");
console.log(fail ? `${fail} failure(s)` : `all ${cases.length + 5} checks pass`);
process.exit(fail ? 1 : 0);
