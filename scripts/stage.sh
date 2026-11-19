#!/bin/sh
# Bring both surfaces up, so a demo or a recording is one command away.
#
#   ./scripts/stage.sh
#
# Leaves: the web console on :4173, a booted simulator with the app installed,
# an Appium server on :4723, and a `both-ends doctor` verdict.
set -eu
cd "$(dirname "$0")/.."
export PATH=/opt/homebrew/bin:$PATH

echo "— web console"
if curl -sf -m 1 http://127.0.0.1:4173/api/menu >/dev/null; then
  echo "  already up on :4173"
else
  (node demo/server/index.js >/tmp/both-ends-web.log 2>&1 &)
  for i in $(seq 1 20); do curl -sf -m 1 http://127.0.0.1:4173/api/menu >/dev/null && break; sleep 0.25; done
  echo "  started on :4173"
fi

echo "— simulator"
DEVICE="${DEVICE:-iPhone 18 Pro}"
xcrun simctl boot "$DEVICE" 2>/dev/null || true
xcrun simctl bootstatus "$DEVICE" -b >/dev/null 2>&1 || true

echo "— app"
if [ ! -d demo/ios/BothEndsDemo.xcodeproj ]; then
  (cd demo/ios && xcodegen generate >/dev/null)
fi
(cd demo/ios && xcodebuild -project BothEndsDemo.xcodeproj -scheme BothEndsDemo \
  -sdk iphonesimulator -configuration Debug -derivedDataPath ../build build >/tmp/both-ends-build.log 2>&1) \
  && echo "  built" || { echo "  build failed, see /tmp/both-ends-build.log"; exit 1; }
xcrun simctl install booted demo/build/Build/Products/Debug-iphonesimulator/BothEndsDemo.app
echo "  installed"

echo "— appium"
if curl -sf -m 2 http://127.0.0.1:4723/status >/dev/null; then
  echo "  already up on :4723"
else
  (appium --log /tmp/appium.log >/dev/null 2>&1 &)
  for i in $(seq 1 40); do curl -sf -m 1 http://127.0.0.1:4723/status >/dev/null && break; sleep 0.5; done
  echo "  started on :4723"
fi

echo
node bin/both-ends.js doctor || true
cat <<'EOF'

next:
  node bin/both-ends.js run  journeys/place-order-two-ends.journey.md      # live, needs kane-cli login
  node bin/both-ends.js loop journeys/place-order-two-ends.journey.md \
    --fake fixtures/demo/loop-1 --fake fixtures/demo/loop-2               # recorded, no account
  node scripts/shoot-web.mjs   docs/img                                    # browser totals
  node scripts/shoot-phone.mjs docs/img                                    # phone totals
EOF
