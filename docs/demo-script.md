# Demo video — shot list (3:40 target, hard cap 5:00)

Record at 1440×900 or larger, no talking head needed. Terminal font ≥ 15pt.
Every number in this script is real output from this repo — do not paraphrase
numbers on the fly, read them off the screen.

## 0:00–0:22 — the two green suites

**Screen:** the side-by-side image `docs/img/both-ends.png` full-bleed.

> "Same product. Same promo code. Left: the iPhone says the order is twenty-four
> ninety-four. Right: the browser says eighteen seventy-five. Both test suites are
> green, because the web suite can't see the phone and the phone suite can't see
> the browser. This is `both-ends`."

## 0:22–0:50 — what it is

**Screen:** terminal, repo root, `cat journeys/place-order-two-ends.journey.md`
scrolled slowly to the steps.

> "A journey is one plain-English story: add a bowl, apply HACK25, read the
> discount, read the total, place the order. Six named outcomes, each with one
> line of instruction per surface. Not a screenshot diff — the agent has to say
> what it saw, and the anchor is the concrete value it must agree on."

## 0:50–1:35 — the run

**Screen:** `node bin/both-ends.js run journeys/…` (live kane-cli, or
`--fake fixtures/demo/loop-1` if the account isn't warm).

> "One command. Kane drives Chrome on the left and the iOS simulator on the right,
> from the same journey. Watch what it reports: not 'eight steps passed' — a table.
> Six rows, two statuses per row."

**Hold on the DIVERGED table.**

> "Four agree. Two split. The discount line and the order total are the same
> journey step and they disagree — that's a real bug the suites missed."

## 1:35–2:05 — the alignment argument (the part judges remember)

**Screen:** `npx`-free, just open `src/align.js` at the scoring function, then cut
to the two raw NDJSON files side by side (`diff` of the replay files).

> "The obvious implementation compares step one to step one, step two to step two.
> That breaks the moment the browser has to accept a cookie banner the phone never
> shows — every step after it is off by one, and you get eight fake divergences.
> So alignment is by intent: every journey anchor is scored against every
> observation, then we take the best order-preserving alignment. The cookie banner
> has nowhere to land, so it drops out. A paraphrase — 'a discount of 0.06' versus
> 'discount line shows 6.25' — still lands on the right step."

## 2:05–2:40 — the sealed pack

**Screen:** `ls` the artifact dir, then `cat SEAL.json`, then open `report.md`.

> "Both raw runs are kept exactly as Kane emitted them, merged by
> `kane-cli evidence merge` into one pack — the pack format is Kane's, this tool
> never invents one — and sealed with a SHA-256 of every input. Re-hash it and you
> get the same verdict. Nothing here is a screenshot of a green checkmark."

## 2:40–3:20 — the loop closes

**Screen:** `node bin/both-ends.js loop … --fix ./scripts/apply-fix.sh --rebuild "…xcodebuild…"`

> "The report is a bug report, so it's also the fix ticket. `brief.md` contains
> only the two split steps, what each surface actually showed, and the rerun
> command. The agent gets that, patches the Swift file — one line, the promo rate
> is a fraction and the maths divides by a hundred again — we rebuild, and we
> rerun the same journey."

**Cut to CONVERGED table.**

> "Six of six. Two loops. That's the closed loop: not 'the agent said it fixed it',
> the same journey, re-proven on both ends."

## 3:20–3:40 — close

**Screen:** repo README, then the artifacts dir.

> "`both-ends` — one journey, two surfaces, one proof, and the exact step where
> the story splits. Sixteen tests, zero runtime dependencies, works offline with
> recorded runs. It's on GitHub now."

---

## Recording notes

- Boot and quiet the simulator first: `xcrun simctl boot "iPhone 18 Pro"`, close
  notification banners.
- Keep the demo server up (`npm run demo`) and pre-warm the page once, so the
  first paint isn't a flash of unstyled white.
- If a live Kane run is slow, cut the gap and say "it took ninety seconds" —
  don't speed the footage up so far the table isn't readable.
- Hard rule for the recording: never show a table that this repo didn't print.
