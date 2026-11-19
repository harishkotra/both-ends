# both-ends

**One plain-English journey. Two surfaces. One proof — and, when they disagree, the exact step where the story splits.**

A web suite can't see the phone. A mobile suite can't see the browser. So the bug that ships is the one where the total is `$18.75` on the web and `$24.94` in the app, and both suites are green.

`both-ends` runs one journey against a browser **and** an iOS app, aligns the two runs by *what the agent was trying to do* (not by step index), and reports where they diverge. Then it seals both runs into one evidence pack and hands the diverging steps to a coding agent as a repair brief — so the loop closes with a rerun, not a comment.

```
$ both-ends loop journeys/place-order-two-ends.journey.md

Both Ends · Place an order and read the total back
desktop   ran  8 steps   |   simulator ran  8 steps

#  journey step                        desktop  simulator  divergence
1  cart badge shows 1 item             pass     pass       agree
2  promo code HACK25 shown as applied  pass     pass       agree
3  subtotal shows 25.00                pass     pass       agree
4  discount line shows 6.25            pass     FAIL       SPLIT
5  order total shows 18.75             pass     FAIL       SPLIT
6  confirmation shows an order number  pass     pass       agree

DIVERGED  4/6 agree on both surfaces  ·  2 split
brief → .both-ends/both-ends-.../brief.md

loop 2: reran both surfaces
CONVERGED 6/6 agree on both surfaces
converged after 2 loops
```

That is the whole product: a divergence table a human can read in two seconds, with a sealed pack behind it and a machine-readable brief in front of it.

---

## Why it is built this way

**1. Alignment by intent, not by index.** The browser run has steps the phone doesn't ("Accept all cookies"). The phone has steps the browser doesn't ("Allow notifications"). Index-diffing those runs produces false divergences and hides real ones. `both-ends` scores every journey step against every observation (token overlap with stopword and numeric weighting), then finds the best **monotone** global alignment with affine gaps — so order is respected, extras are ignored, and a paraphrase ("no discount line is shown" vs "discount line shows 6.25") still lands on the right step. There is a test named *"alignment never compares by index"* that fails if you change this.

**2. Named steps, not screenshots.** A journey is six named outcomes with one line of instruction per surface. Screenshot diffing tells you the phone looks different; it can't tell you the promo code silently stopped applying. Named steps survive redesigns, and they're the unit a repair brief can point at.

**3. `kane-cli` owns the evidence format.** `both-ends` never invents a pack format. It drives `kane-cli run --agent`, keeps the raw NDJSON from both surfaces, asks `kane-cli evidence merge` to seal them into one pack — and then writes its own sidecar (`divergence.json`, `report.md`, `SEAL.json`) with a SHA-256 of every input. Anyone can re-hash the pack and check the claim *"these two runs produced this verdict"*.

**4. The loop is the demo.** A divergence report is a bug report. The interesting part is that the report is machine-actionable: `brief.md` contains only the steps that split, what each surface actually showed, and the exact rerun command. `--fix` hands it to whatever you use (Claude Code, Codex, a shell script). Loop count is the proof the loop closed.

---

## Quickstart

```bash
git clone <repo> && cd both-ends
npm test                                   # 16 tests, no network, no account

# 1. run the demo app + console
npm run demo                               # http://127.0.0.1:4173
cd demo/ios && xcodegen generate && xcodebuild \
  -project BothEndsDemo.xcodeproj -scheme BothEndsDemo \
  -sdk iphonesimulator -configuration Debug -derivedDataPath ../build build

# 2. prove both ends with kane-cli
kane-cli login                             # once
node bin/both-ends.js run journeys/place-order-two-ends.journey.md

# 3. close the loop
node bin/both-ends.js loop journeys/place-order-two-ends.journey.md \
  --fix ./scripts/apply-fix.sh \
  --rebuild "cd demo/ios && xcodebuild -project BothEndsDemo.xcodeproj -scheme BothEndsDemo -sdk iphonesimulator -configuration Debug -derivedDataPath ../build build"

# no simulator / no account? replay recorded runs instead:
node bin/both-ends.js loop journeys/place-order-two-ends.journey.md \
  --fake fixtures/demo/loop-1 --fake fixtures/demo/loop-2
```

`both-ends doctor` checks kane-cli, the iOS runtime, simulator devices and login state before you waste a run.

---

## The journey file

```markdown
---
id: place-order-two-ends
surfaces: desktop, simulator
url: http://127.0.0.1:4173
app: demo/build/Build/Products/Debug-iphonesimulator/BothEndsDemo.app
device: iPhone 18 Pro
policy: policies/both-ends.yaml
---

## Objective
### desktop
Open {{url}}. Add one Signature Bowl, apply HACK25, read the totals …
### simulator
Launch the app. Add one Signature Bowl, apply HACK25, read the totals …

## Steps
1. anchor: discount line shows 6.25
   desktop: the cart shows a discount of 6.25
   simulator: the cart shows a discount of 6.25
```

One objective per surface (the agent needs to know how to start), one anchor per shared outcome (the thing that must agree). Anchors contain the concrete value — "the total is discounted" is not testable, "order total shows 18.75" is.

---

## What's in the pack

```
.both-ends/both-ends-place-order-two-ends-<id>/
├── divergence.json     every step, both statuses, divergence class, confidence
├── report.md           the human table
├── brief.md            repair brief: only the split steps + rerun command
├── brief.json          same, structured, for an agent
├── replay/desktop.ndjson   raw events, exactly as kane-cli emitted them
├── replay/simulator.ndjson
├── SEAL.json           sha256 of every artifact + the merged pack
└── *.evidence          the merged pack (when merging is on)
```

Divergence classes: `agreed-pass`, `agreed-fail`, `split`, `unproven`, `error`. **`split` is the only class that proves the surfaces disagree.** `unproven` (a step one surface never reached) and `error` (a surface never ran) are explicitly *not* passes — the verdict policy fails on them.

`policies/both-ends.yaml` is a real `kane-cli evidence lint-policy`-validated policy: nothing failed, nothing broken, nothing skipped, every test replayable. `both-ends lint <policy>` checks it before a run.

---

## Verified today

| Claim | How it's checked |
|---|---|
| 16 behavioural tests pass | `npm test` — parser, aligner, divergence classes, brief, report, loop, merge wiring |
| Alignment ignores extra steps and order | test *"alignment never compares by index"* |
| A paraphrase still maps to its step | test *"paraphrased failures are rescued inside their order window"* |
| A surface that never ran is never a pass | test *"a surface that never ran is an error, not a pass"* |
| Merge delegates to kane-cli and hashes output | test with a stub `kane-cli` (`BOTH_ENDS_KANE`) |
| The loop converges only on a real second run | test *"the loop closes only when the second run agrees"* |
| Web console totals are right | `POST /api/orders` → `{"subtotal":25,"discount":6.25,"total":18.75}` |
| iOS app builds and renders | `xcodebuild … BUILD SUCCEEDED`, screenshot in `docs/img/` |

**Not yet verified, and not claimed:** a live `kane-cli` run needs (a) a TestMu AI login — the account is the entrant's, so `both-ends` never asks for credentials — and (b) on `darwin-arm64`, Kane 0.10.6 publishes no managed simulator dependency bundle, so the phone surface needs a self-managed Appium endpoint (`--appium-url`). Both are environment gates, not code paths; the fixture runs above exercise the same pipeline end to end.

## Repo layout

```
src/journey.js    parse frontmatter + named steps
src/align.js      monotone global alignment over intent similarity
src/diverge.js    status normalization + divergence classification
src/kane.js       the only file that talks to kane-cli
src/evidence.js   merge, seal, hash, policy lint
src/brief.js      split steps → repair brief
src/loop.js       prove → brief → fix → prove → count
bin/both-ends.js  CLI
demo/web          the desktop surface (no build step)
demo/ios          the phone surface (SwiftUI, one deliberate bug)
demo/server       shared menu + orders API
fixtures/         recorded NDJSON so tests and demos are deterministic
```

Built for the TestMu AI × Kane CLI hackathon, November 2026.
