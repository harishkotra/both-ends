#!/bin/sh
# The "agent" half of the loop, made reproducible.
#
# In a real workflow this is where Claude Code / Codex / Cursor gets handed
# brief.md and makes the change. For the recorded demo it is this one-line patch,
# so the loop can be replayed on any machine without a model in the room.
#
# Usage: both-ends loop <journey> --fix ./scripts/apply-fix.sh \
#          --rebuild "cd demo/ios && xcodebuild -project BothEndsDemo.xcodeproj -scheme BothEndsDemo -sdk iphonesimulator -configuration Debug -derivedDataPath ../build build"
set -eu

BRIEF="${1:-.both-ends/brief.md}"
CART="demo/ios/BothEndsDemo/Cart.swift"

if [ -f "$BRIEF" ]; then
  echo "reading $(basename "$BRIEF")"
  # Show the agent what it was told to fix.
  sed -n '/^## Step/,/^$/p' "$BRIEF" | head -20 || true
fi

if grep -q 'subtotal \* Promo.rate / 100' "$CART"; then
  python3 - "$CART" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1])
s = p.read_text()
s = s.replace("let raw = subtotal * Promo.rate / 100", "let raw = subtotal * Promo.rate")
s = s.replace(
    "// NOTE: the phone keeps the promo rate as a fraction (0.25) and the cart maths\n"
    "// divides by 100 as if it were a percentage. That single extra division is the\n"
    "// bug `both-ends` is here to catch: the web console halves nothing, the phone\n"
    "// shows a six-cent discount, and the order total stops matching.",
    "// The phone keeps the promo rate as a fraction (0.25) and applies it directly.\n"
    "// Both ends now compute the same discount from the same rate.",
)
p.write_text(s)
PY
  echo "patched $CART"
else
  echo "nothing to patch in $CART (already fixed?)"
fi
