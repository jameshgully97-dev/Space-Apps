# SkyTrack: live satellite tracker for iOS

Point your iPhone at the sky and see which satellites are overhead, live on the camera feed.

## Features
- **Whole catalog**: downloads current orbital elements from [CelesTrak](https://celestrak.org) (all ~10,000+ active satellites by default; you can switch to stations, brightest, Starlink, GNSS, weather, GEO or recent launches).
- **On-device SGP4/SDP4**: a Swift port of Vallado's reference propagator (`Packages/OrbitCore`), tested against reference vectors for near-Earth, deep-space and resonant orbits.
- **Camera AR view**: the device attitude (CoreMotion, true north) is projected through the camera's real field of view. It shows satellite dots colour-coded by type, names near the reticle, a horizon line, compass points, and an arrow that leads you to a selected satellite.
- **Sky map**: an all-sky polar chart. It works in the Simulator.
- **Lists & details**: what's overhead right now, a searchable catalog, live az/el/range/altitude, a ground-track map, sunlit/shadow state and pass predictions for the next 48 h.
- Filters (elevation, category, sunlit-only), compass correction and manual location.

## Setup
Requires macOS with Xcode 16+ and an iPhone running iOS 17+.

```bash
./setup.sh
```

The script installs [XcodeGen](https://github.com/yonaskolb/XcodeGen) via Homebrew if needed, generates `SkyTrack.xcodeproj`, runs the orbit-engine tests and opens Xcode. Then choose your signing team, select your iPhone and press Run.

`./setup.sh --ci` also builds the app for the Simulator; GitHub Actions runs it on every push.

## Layout
```
Packages/OrbitCore/      Pure-Swift orbit engine (SGP4, TLE/OMM parsing, coordinates, Sun, passes) + tests
App/SkyTrack/            SwiftUI app
  Services/              CelesTrak catalog, location, motion, camera, sky engine
  Views/                 Camera AR view, sky map, lists, detail, settings
project.yml              XcodeGen project definition
setup.sh                 One-shot setup / CI script
```

## Notes
- Compass accuracy limits alignment. If labels are offset from what you see, wave the phone in a figure-eight or use *Settings → Compass correction*.
- Satellites in sunlight against a dark sky (Sun more than 6° below the horizon) are the ones you can actually see with the naked eye. Turn on *Only sunlit* to show just those.
