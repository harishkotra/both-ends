# Submission checklist

Deadline: **26 Nov 2026, 23:59 IST**. Winner-take-all, three slots, ties broken on
*Verified* then *Closed loop*.

## Gates

| Gate | State |
|---|---|
| Register on testmuai.com + claim the 10,000 credits with the same email | **needs Harish** |
| `kane-cli` authenticated for the live run | **needs Harish** (`kane-cli login --oauth`) |
| Public repo, initialised after 12 Nov, commit from hour one | **done** — https://github.com/harishkotra/both-ends, created 19 Nov, first commit same hour |
| 3–5 minute demo video on YouTube (public or unlisted) | **cut, not uploaded** — `docs/video/both-ends-demo.mp4` (3:18, silent, captioned); upload + optional voice-over |
| Two public posts | **to publish** — drafts in `docs/posts.md` |

## What is already true in the repo

- 16 behavioural tests green (`npm test`), no network, no account.
- One journey file drives both surfaces; alignment by intent with order-preserving
  gaps, and `unproven` is never a pass.
- Divergence table, repair brief (Markdown + JSON), sealed artifact dir with a
  SHA-256 of every input, policy that passes `kane-cli evidence lint-policy`.
- Evidence merge delegated to `kane-cli evidence merge` — the pack format is Kane's.
- Real proof of the bug on both ends, captured by automation:
  `docs/img/web-cart-ok.png` (+ `web-totals.json`) and
  `docs/img/phone-02-cart-bug.png` (+ `phone-totals.json`).
- Loop closes on a rerun: `--fake fixtures/demo/loop-1 --fake fixtures/demo/loop-2`
  prints DIVERGED then CONVERGED, "converged after 2 loops".

## The cut that exists

`docs/video/both-ends-demo.mp4` — 3:18, 1920×1080, 2.7 MB, silent. Every frame is
real output from this repo (the loop transcript, the journey file, the aligner, the
two report pages, the 21-test run) rendered by `scripts/make-demo-video.py`. Upload
it unlisted, then either leave it silent (it is captioned throughout) or record a
voice-over over it using `docs/demo-script.md` as the read.

## Before re-recording

1. `./scripts/stage.sh` — web console, simulator app, Appium, doctor verdict.
2. `kane-cli login --oauth` (once) so `both-ends run` is a live Kane run, not a replay.
3. If the live run is slow on the day, record the replay (`--fake`) and say so on
   camera. Never show a table this repo didn't print.

## Judging angles to hit on camera

- **Verified:** hash-sealed pack, numbers read out of the real DOM and the real
  accessibility tree, plus `npm test` output.
- **Closed loop:** brief → agent → patch → rebuild → rerun → converged, loop count
  on screen.
- **Craft:** zero runtime dependencies, works offline, `doctor` explains what's
  missing instead of failing mysteriously.

## After publishing

- Drop the repo link and the video link in the hackathon submission form.
- Post both drafts within an hour of each other; reply to comments with the
  divergence table image (`docs/img/both-ends.png`).
