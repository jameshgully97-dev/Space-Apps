# Conflict Globe

A real-time 3D globe of **reported armed conflict** and **live military aircraft**, built on CesiumJS. It runs in the browser and installs as a Windows desktop app.

## What you see

| Zoom level | What's drawn |
|---|---|
| Orbit / continent | Clustered markers with counts, colour-coded by conflict type. Markers reported in the last hour pulse. |
| Country / region | Individual event markers. Live aircraft with their recent track trails and ID labels (`callsign · type · flight level`). |
| City / street (< ~70 km) | **Animated scenes** at each event: soldiers walking and firing, tanks manoeuvring and firing, artillery firing with impacts, jets making strike passes, drones orbiting, ships patrolling, explosions and fires. |

**Aircraft** are drawn with a silhouette that matches the ICAO type the transponder reports: fighter, bomber, transport, tanker, helicopter (rotor spins), drone or airliner. They're rotated to their real track, placed at their real altitude, and dead-reckoned between polls so they move smoothly. Click one to see its details or **Follow** it.

Click an event to see its type, place, actors and links to the source articles.

## Verifying events against their coverage

GDELT codes news automatically, so figurative language can be coded as combat: "legal battle over Manhattan zoning", "Senate fight over the budget", "Knicks battle Celtics". To catch this, the app reads the headline words of **every article that mentions an event**. These come from each article's URL, using GDELT's companion *mentions* files. Then it labels the event:

| Status | Rule | On the map |
|---|---|---|
| **Verified** | Headlines use unambiguous physical-violence terms: killed, shelling, airstrike, gunmen, explosion, missile, drone strike… | normal marker; animated when zoomed in |
| **Unverified** | No evidence either way: no readable headline, non-English, or mixed signals such as "police shooting trial verdict" | faded marker, never animated |
| **Filtered** | Headlines read as legal, political, sports, business, health or entertainment news, with no violence terms | hidden by default (toggle in the feed panel) |

* **Weak words never verify an event on their own:** battle, fight, attack, war, strike, clash, raid.
* **Idioms are recognised as figurative:** heart attack, think tank, trade war, legal battle, war of words.
* **Past events don't count:** words such as trial, verdict, anniversary or memorial mark coverage of something that already happened.
* **The coverage beats the machine code:** when the coverage says what happened, its wording replaces the machine coding. A "use of force" coding whose articles say *shelling* is shown as **Shelling / artillery fire**.
* **You can check the reasoning:** each event's details card lists the headlines it was judged on and why.
* **Running the checks:** `node test/verify.test.mjs`

## Military vs police vs everything else

Every event is classified by **who started it**, using the actor-type codes GDELT gives the initiating actor (Actor1). The kind of violence never decides this.

| Force | Rule | Marker | Animated scene |
|---|---|---|---|
| **Military** | Initiator has an explicit armed-forces code (`MIL`) | circle | soldiers, tanks, artillery, jets, drones, warships |
| **Armed group** | Rebels, insurgents, separatists, unaligned armed forces (`REB` `INS` `SEP` `UAF`) | diamond | irregular fighters; no jets or warships |
| **Police** | Law enforcement (`COP`). If an actor carries both police and military codes (gendarmerie), police wins | shield | police officers and patrol cars only |
| **Unattributed** | Anything else: criminal, civilian, intelligence, country-level only, or no actor at all | dashed square | no people or vehicles, only explosions/fire |

* Violence aimed **at** soldiers or police doesn't make an event military or police. The target is shown separately.
* Military and police reports of the same incident type at the same place are never merged into one marker.
* Event names are neutral ("Use of force", not CAMEO's "Use conventional military force"), because GDELT applies those codes to police and criminal violence too.
* Use the **Who acted** filter in the feed panel to show or hide each force.
* The rule is deliberately strict, so real military actions that the news coding attributes only to a country (e.g. `RUS`) appear as **Unattributed**.

## National kit

Animated soldiers wear a stylised version of **their military's camouflage**, with a flag patch on the shoulder and the identification armbands used in the field. For example, Ukrainian forces wear yellow tape and Russian forces white tape. Tanks carry national colours and a flag decal. About 25 militaries are defined in `js/uniforms.js`; unknown countries get a generic olive kit with no flag.

* The **initiating side** wears the kit of GDELT's Actor-1 country. The **other side** wears Actor-2's kit when that actor is identified as a military or police force. Otherwise it gets a generic kit.
* **Armed groups** are drawn as irregular fighters with no flag, so a group is never attributed to a state.
* **Police** wear police uniforms with their country's flag patch.
* **Skin tones are varied at random within every group and are never assigned by country or region.** Militaries are multi-ethnic, and mapping appearance to nationality would be stereotyping, not accuracy.

## Data sources and limits (please read)

| Layer | Source | Latency | What it is |
|---|---|---|---|
| Conflict events | [GDELT 2.0](https://www.gdeltproject.org/) | ~15 min | Machine-coded world news (CAMEO codes 15x/18x/19x/20x), geolocated to where the article places the action. Country-level geocodes are dropped and duplicate reports are merged. |
| Military aircraft | [adsb.lol](https://adsb.lol), falls back to [airplanes.live](https://airplanes.live) | ~1 to 10 s | Real ADS-B positions of aircraft flagged as military, worldwide. |
| All aircraft near the view | Same | ~1 to 10 s | Every transponder within 250 nm of the view centre, when zoomed in. |
| GhostNet plan | [GhostNet v1.5](https://github.com/s2underground/GhostNet) by S2 Underground | static | Off-grid HF radio net schedule, JS8Call / RTTY / voice frequencies, ALE channel plan and JS8 groups. |
| GhostNet radio activity | [PSKReporter](https://pskreporter.info) | 5 min | Automatic JS8Call reception reports on GhostNet frequencies (3.575 / 7.107 / 14.107 MHz), located to their Maidenhead grid square. |

* **The soldiers, tanks, artillery, jets, drones and ships around an event are symbolic.** They show the *type* of the reported event at its reported location. No public source publishes the live positions of individual troops or vehicles, and this app doesn't try to.
* GDELT coding is automated. It can misclassify events, duplicate them, or pick up articles about past events. Check the source articles before relying on any single marker.
* Many military aircraft fly without transponders over active war zones, so air coverage there is partial.

## GhostNet HF radio (📻)

The 📻 button opens the GhostNet panel. It shows:
* whether a GhostNet comms window is **on air right now**, with countdowns to the next nets
* live JS8Call activity per band
* the full weekly schedule in UTC, the JS8Call/RTTY/voice frequencies, the 27-channel ALE plan from the GhostNet codeplug, and the JS8Call group names

On the globe, stations heard on GhostNet JS8 frequencies appear as radio masts, coloured by band. The HF paths between transmitter and receiver are drawn as arcs. A gold ring marks a callsign on the HFN ALE net list. Being heard on these frequencies does **not** mean a station is taking part in GhostNet. The 80 m range can also catch ordinary JS8 traffic near 3.578 MHz.

GhostNet material is © S2 Underground under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). The plan data in `js/ghostnet/plan.js` is derived from it, so that file is for non-commercial use under the same licence.

## Running on Windows

1. Download or clone this folder.
2. Double-click **`ConflictGlobe.cmd`**.

This starts a small local server (`server.ps1`, built-in PowerShell, nothing to install) at `http://localhost:8787`. It opens the app in a chromeless Microsoft Edge window. The server also acts as an allow-listed proxy for the live feeds, which don't send CORS headers. To get a Start-menu or taskbar app, click the **⤓ Install** button in the top bar (or use Edge's menu → *Apps → Install this site as an app*).

Other platforms: `node server.js` (Node 18+), then open http://localhost:8787.

### Hosting on a public URL

The folder is a static site and can be served from any web host (for example GitHub Pages). Without the bundled server, the browser can't reach the feeds directly. To fix that, deploy `tools/cloudflare-worker.js` as a Cloudflare Worker, then set **Settings → CORS proxy URL** to `https://<worker>.workers.dev/?url=`.

## Optional upgrades (Settings ⚙)

* **Google Maps API key** (Map Tiles API enabled): switches to Google Photorealistic 3D Tiles, with true 3D cities and terrain worldwide.
* **Cesium ion token**: adds Cesium World Terrain.
* **Demo mode** (or `?demo=1`): clearly labelled simulated data, for offline presentations.

Without keys you get Esri World Imagery (satellite) with NASA Black Marble city lights on the night side. The sun's position and the day/night terminator follow real time.

## Controls

Drag to rotate, scroll to zoom, right-drag or Ctrl-drag to tilt. Keys: `F` feed panel, `L` layers, `G` GhostNet panel, `H` home, `Esc` close details.

## Project layout

```
index.html, css/app.css     UI shell
js/main.js                  viewer setup, UI wiring, selection, follow mode
js/config.js                endpoints, CAMEO → category, ICAO type → silhouette
js/net.js                   CORS-aware fetch routing, tiny ZIP reader
js/sprites.js               all artwork, drawn procedurally on canvas
js/feeds/                   GDELT, ADS-B, PSKReporter, demo data
js/feeds/verify.js          headline-based verification of events
js/ghostnet/plan.js         GhostNet schedule, frequencies, ALE channels
js/layers/                  event markers, unit scenes, aircraft, radio
server.ps1 / server.js      local server and feed proxy
ConflictGlobe.cmd           Windows launcher
sw.js, manifest.webmanifest installable PWA
```
