#!/usr/bin/env bash
# Sets up the SkyTrack iOS project.
#
#   ./setup.sh          generate SkyTrack.xcodeproj, run core tests, open Xcode
#   ./setup.sh --ci     generate, test, and build for the iOS Simulator (no Xcode UI)
#   ./setup.sh --no-open
set -euo pipefail
cd "$(dirname "$0")"

CI_MODE=0
OPEN=1
for arg in "$@"; do
  case "$arg" in
    --ci) CI_MODE=1; OPEN=0 ;;
    --no-open) OPEN=0 ;;
    *) echo "unknown option: $arg"; exit 2 ;;
  esac
done

step() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*"; }

if [[ "$(uname)" != "Darwin" ]]; then
  warn "Building an iOS app needs macOS with Xcode. Only the OrbitCore tests can run here."
  if command -v swift >/dev/null; then
    step "Running OrbitCore tests"
    swift test --package-path Packages/OrbitCore
  else
    warn "Swift toolchain not found; skipping tests. Install from https://swift.org/install"
  fi
  exit 0
fi

step "Checking Xcode"
if ! xcodebuild -version >/dev/null 2>&1; then
  echo "Xcode is required. Install it from the App Store, then run: sudo xcode-select -s /Applications/Xcode.app"
  exit 1
fi
xcodebuild -version | head -1

step "Checking XcodeGen"
if ! command -v xcodegen >/dev/null; then
  if command -v brew >/dev/null; then
    brew install xcodegen
  else
    echo "XcodeGen is required: install Homebrew (https://brew.sh) then run 'brew install xcodegen'."
    exit 1
  fi
fi

step "Generating SkyTrack.xcodeproj"
xcodegen generate --spec project.yml

step "Running OrbitCore tests (orbit propagation)"
swift test --package-path Packages/OrbitCore

if [[ $CI_MODE == 1 ]]; then
  step "Building app for the iOS Simulator"
  xcodebuild build \
    -project SkyTrack.xcodeproj \
    -scheme SkyTrack \
    -destination 'generic/platform=iOS Simulator' \
    -derivedDataPath build \
    CODE_SIGNING_ALLOWED=NO | (command -v xcpretty >/dev/null && xcpretty || cat)
  exit "${PIPESTATUS[0]}"
fi

step "Done"
cat <<'MSG'
Next steps:
  1. In Xcode select the SkyTrack target > Signing & Capabilities and choose your team.
  2. Plug in your iPhone, pick it as the run destination and press Run (Cmd-R).
  3. Allow camera, location and motion access, then point the phone at the sky.
The Simulator works for the Sky Map and list tabs (set a manual location in Settings).
MSG

if [[ $OPEN == 1 ]]; then open SkyTrack.xcodeproj; fi
