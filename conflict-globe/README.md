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
js/ghostnet/plan.js         GhostNet schedule, frequencies, ALE channels
js/layers/                  event markers, unit scenes, aircraft, radio
server.ps1 / server.js      local server and feed proxy
ConflictGlobe.cmd           Windows launcher
sw.js, manifest.webmanifest installable PWA
```
