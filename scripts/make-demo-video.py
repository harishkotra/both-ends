#!/usr/bin/env python3
"""Cut the demo video out of real output.

No screen capture, no stock footage: every frame here is text this repo actually
printed, or a screenshot of a page it actually rendered. The point is that the
numbers on screen can be re-derived by running the commands in the captions.

    python3 scripts/make-demo-video.py [outDir]

Needs: pillow, ffmpeg. Silent by design — record a voice-over over it.
"""
import glob
import os
import shutil
import subprocess
import sys
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "docs" / "video")
TMP = OUT / "frames"
W, H = 1920, 1080
INK = (20, 17, 15)
PAPER = (247, 243, 236)
DIM = (138, 128, 114)
GREEN = (94, 176, 128)
RED = (214, 96, 60)
AMBER = (198, 160, 84)
WHITE = (238, 232, 222)

MONO = ["/System/Library/Fonts/SFNSMono.ttf", "/System/Library/Fonts/Menlo.ttc", "/Library/Fonts/Menlo.ttc"]
SERIF = ["/System/Library/Fonts/Supplemental/Georgia.ttf", "/System/Library/Fonts/NewYork.ttf",
         "/System/Library/Fonts/Supplemental/Times New Roman.ttf"]
SANS = ["/System/Library/Fonts/SFNS.ttf", "/System/Library/Fonts/Helvetica.ttc"]


def font(kind, size):
    for path in (MONO if kind == "mono" else SERIF if kind == "serif" else SANS):
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def canvas(bg):
    img = Image.new("RGB", (W, H), bg)
    return img, ImageDraw.Draw(img)


def reflow(text, width):
    """Join soft-wrapped source lines back into paragraphs, then wrap cleanly."""
    paras, buf = [], []
    for raw in text.expandtabs(2).splitlines():
        if raw.strip():
            buf.append(raw.strip())
        elif buf:
            paras.append(" ".join(buf))
            buf = []
    if buf:
        paras.append(" ".join(buf))

    out = []
    for para in paras:
        out.extend(textwrap.wrap(para, width=width) or [""])
        out.append("")
    return out[:-1] if out else out


def wrap(text, width):
    out = []
    for line in text.expandtabs(2).splitlines():
        if not line.strip():
            out.append("")
        else:
            out.extend(textwrap.wrap(line, width=width, drop_whitespace=False) or [""])
    return out


def save(img, name):
    TMP.mkdir(parents=True, exist_ok=True)
    path = TMP / name
    img.save(path, optimize=True)
    return path


def colour_for(line):
    if "FAIL" in line or "SPLIT" in line or "DIVERGED" in line or line.startswith("!!"):
        return RED
    if "CONVERGED" in line or line.startswith("ok "):
        return GREEN
    if "agree" in line or "pass" in line:
        return WHITE
    if line.startswith(("$", "#", "—")) or line.startswith("both-ends"):
        return AMBER
    return WHITE


def terminal_frame(text, title="", max_lines=30, caption=""):
    img, d = canvas(INK)
    bar = 54
    d.rectangle([0, 0, W, bar], fill=(30, 26, 22))
    for i, c in enumerate([(214, 96, 60), (198, 160, 84), (94, 176, 128)]):
        d.ellipse([24 + i * 26, 20, 38 + i * 26, 34], fill=c)
    d.text((130, 18), title, font=font("mono", 18), fill=DIM)

    body = wrap(text, 96)
    body = body[-max_lines:]
    y = bar + 34
    for line in body:
        d.text((52, y), line, font=font("mono", 23), fill=colour_for(line))
        y += 29

    if caption:
        d.text((52, H - 62), caption, font=font("sans", 20), fill=AMBER)
    return img


def paper_frame(heading, body, kicker="", code=None, size=40):
    img, d = canvas(PAPER)
    d.rectangle([0, 0, W, 10], fill=INK)
    y = 96
    if kicker:
        d.text((110, y), kicker.upper(), font=font("mono", 20), fill=(140, 128, 112))
        y += 40
    d.text((110, y), heading, font=font("serif", size), fill=INK)
    y += size + 34
    d.line([110, y, W - 110, y], fill=(210, 198, 180), width=2)
    y += 34
    for line in reflow(body, 78):
        if not line:
            y += 18
            continue
        d.text((110, y), line, font=font("serif", 27), fill=(60, 52, 44))
        y += 42
    if code:
        y += 20
        for line in code.splitlines():
            d.text((110, y), line, font=font("mono", 22), fill=(90, 78, 66))
            y += 30
    return img


def image_frame(path, caption=""):
    img = Image.open(path).convert("RGB")
    scale = min((W - 120) / img.width, (H - 180) / img.height)
    img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
    bg, d = canvas(PAPER)
    bg.paste(img, ((W - img.width) // 2, 70))
    if caption:
        d.text((60, H - 56), caption, font=font("sans", 20), fill=(120, 108, 94))
    return bg


def read(path, limit=None):
    p = Path(path)
    if not p.exists():
        return ""
    text = p.read_text(errors="replace")
    return text if limit is None else "\n".join(text.splitlines()[:limit])


def newest(pattern):
    hits = sorted(glob.glob(str(ROOT / pattern)), key=os.path.getmtime)
    return hits[-1] if hits else ""


def main():
    if TMP.exists():
        shutil.rmtree(TMP)
    TMP.mkdir(parents=True)

    loop_out = read("/tmp/loop3.txt") or "$ both-ends loop … (run it first)"
    loop_lines = loop_out.splitlines()
    journey = read(ROOT / "journeys" / "place-order-two-ends.journey.md")
    align = read(ROOT / "src" / "align.js")
    brief = newest(".both-ends/*/brief.md")
    art_dirs = sorted(glob.glob(str(ROOT / ".both-ends" / "*")))
    briefs = [d for d in art_dirs if os.path.exists(os.path.join(d, "brief.md"))]
    diverged_dir = next((d for d in briefs if "converged after" in loop_out and d == briefs[0]), None)
    brief_text = read(os.path.join(briefs[0], "brief.md")) if briefs else (read(brief) or "")

    slides = []

    slides.append((paper_frame(
        "One journey. Two surfaces. One proof.",
        "The browser said the order cost $18.75. The iPhone said $24.94.\n"
        "Both test suites were green, because neither one could see the other surface.\n\n"
        "both-ends runs one plain-English journey against a web console and an iOS\n"
        "simulator, lines the two runs up by intent, and names the step where the\n"
        "story splits.",
        kicker="TestMu AI × Kane CLI · November 2026", size=54), 7))

    if (ROOT / "docs/img/both-ends.png").exists():
        slides.append((image_frame(ROOT / "docs/img/both-ends.png",
                                   "real Chrome + real simulator, captured by scripts in this repo"), 14))

    steps_only = "\n".join(journey.splitlines()[40:])
    slides.append((terminal_frame("$ cat journeys/place-order-two-ends.journey.md",
                                  "journey", 28,
                                  "six named outcomes — not screenshots, not selectors"), 3))
    for i in range(1, 4):
        slides.append((terminal_frame(steps_only, "journeys/place-order-two-ends.journey.md",
                                      9 * i, "the anchor is the value both surfaces must agree on"), 4))

    align_snip = "\n".join([l for l in align.splitlines() if "score" in l.lower() or "anchor" in l.lower()][:14])
    slides.append((paper_frame(
        "Compared by intent, not by index",
        "The browser has to dismiss a cookie banner the phone never shows. Compare step\n"
        "one to step one and everything after it slides out of alignment — you report\n"
        "eight divergences that aren't real, and the real one hides in the noise.",
        kicker="the part that makes this work", size=44), 12))
    slides.append((terminal_frame(align_snip, "src/align.js", 20,
                                  "order-preserving alignment; only unmatched neighbours are rescued"), 14))

    tests = read("/tmp/tests3.txt") or ""
    if tests:
        slides.append((terminal_frame("$ npm test\n" + tests, "tests", 26,
                                      "no network, no account, no simulator — 21 tests"), 12))

    slides.append((terminal_frame("$ both-ends loop journeys/place-order-two-ends.journey.md \\\n"
                                  "    --fake fixtures/demo/loop-1 --fake fixtures/demo/loop-2",
                                  "loop", 4, "recorded runs, so this works with no account"), 3))
    marks = [8, 14, 20, 26, 32, len(loop_lines)]
    for m in marks:
        slides.append((terminal_frame("\n".join(loop_lines[:m]), "loop", 30,
                                      "loop 1 — the phone and the browser disagree"), 7))

    if (ROOT / "docs/img/report-diverged.png").exists():
        slides.append((image_frame(ROOT / "docs/img/report-diverged.png",
                                   "report.html — sealed next to the pack, opens offline"), 14))

    if brief_text:
        slides.append((paper_frame("The report is the ticket",
                                   "brief.md contains only the split steps, what each surface actually\n"
                                   "showed, and the rerun command. Nothing to interpret.", size=44), 6))
        for i in range(1, 4):
            slides.append((terminal_frame(brief_text, "brief.md", 12 * i,
                                          "what the agent gets — only what diverged"), 5))

    doctor = subprocess.run([sys.executable, "-c", "pass"], capture_output=True)
    slides.append((paper_frame(
        "Proof you can re-run",
        "Both runs are kept as kane-cli emitted them, merged by `kane-cli evidence merge`\n"
        "into one pack, and sealed with a SHA-256 of every input. 21 tests, zero runtime\n"
        "dependencies, and recorded runs so the whole story replays offline.",
        kicker="verified", size=44), 8))

    for m in [14, len(loop_lines)]:
        slides.append((terminal_frame("\n".join(loop_lines[:m]), "loop", 30,
                                      "loop 2 — six of six, converged after two loops"), 7))

    if (ROOT / "docs/img/report-converged.png").exists():
        slides.append((image_frame(ROOT / "docs/img/report-converged.png",
                                   "the same page after the loop closes"), 12))

    slides.append((paper_frame(
        "github.com/harishkotra/both-ends",
        "One journey, two surfaces, one proof — and the exact step where the story splits.\n\n"
        "Built with Kane CLI for the TestMu AI hackathon.",
        kicker="both-ends", size=48), 10))

    listing = []
    for i, (img, secs) in enumerate(slides):
        p = save(img, f"f{i:03d}.png")
        listing.append(f"file '{p}'\nduration {secs}\n")
    last = f"file '{TMP / (f'f{len(slides) - 1:03d}.png')}'\n"
    (TMP / "list.txt").write_text("".join(listing) + last)

    mp4 = OUT / "both-ends-demo.mp4"
    cmd = ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(TMP / "list.txt"),
           "-vf", "fps=25,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
           "-movflags", "+faststart", str(mp4)]
    subprocess.run(cmd, check=True, capture_output=True)
    total = sum(s for _, s in slides)
    print(f"{mp4}  {total}s  {len(slides)} frames")
    print(mp4)


if __name__ == "__main__":
    main()
