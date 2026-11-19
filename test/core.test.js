import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadJourney } from '../src/journey.js';
import { alignSurfaces, alignSequence, similarity } from '../src/align.js';
import { classifyDivergences, DIVERGENCE, STATUS } from '../src/diverge.js';
import { normalizeEvents } from '../src/kane.js';
import { buildBrief } from '../src/brief.js';
import { renderMarkdown } from '../src/report.js';

const ROOT = resolve(import.meta.dirname, '..');
const JOURNEY = join(ROOT, 'journeys/place-order-two-ends.journey.md');

function fixtureEvents(name) {
  const text = readFileSync(join(ROOT, 'fixtures/demo', name), 'utf8');
  return normalizeEvents(text.split('\n').filter(Boolean));
}

test('journey parses surfaces, objective, and named steps', () => {
  const j = loadJourney(JOURNEY);
  assert.equal(j.id, 'place-order-two-ends');
  assert.deepEqual(j.surfaces, ['desktop', 'simulator']);
  assert.equal(j.steps.length, 6);
  assert.equal(j.steps[0].anchor, 'cart badge shows 1 item');
  assert.match(j.objective.desktop, /HACK25/);
  assert.ok(j.why.length > 10);
});

test('journey rejects a surface that has no objective', () => {
  const dir = mkdtempSync(join(tmpdir(), 'be-'));
  const file = join(dir, 'bad.journey.md');
  writeFileSync(file, `---\nid: bad\nsurfaces: desktop, simulator\n---\n\n## Objective\n\n### desktop\ndo a thing\n\n## Steps\n\n1. anchor: one\n   desktop: one\n   simulator: one\n`);
  assert.throws(() => loadJourney(file), /no "### simulator" objective/);
});

test('similarity prefers the describing line over a neighbouring one', () => {
  const a = similarity('discount line shows 6.25', 'Read the totals: the cart shows a discount of 6.25');
  const b = similarity('discount line shows 6.25', 'Clicked Add to cart on the Signature Bowl');
  assert.ok(a > 0.4, `expected meaningful overlap, got ${a}`);
  assert.ok(a > b);
});

test('alignment never compares by index: extras on one surface do not shift the other', () => {
  const anchors = [
    { text: 'cart badge shows 1 item' },
    { text: 'promo code HACK25 shown as applied' },
  ];
  const withBanner = [
    { text: 'Dismissed the cookie banner' },
    { text: 'the cart badge shows 1 item' },
    { text: 'promo code HACK25 is shown as applied' },
  ];
  const aligned = alignSequence(anchors, withBanner);
  assert.equal(aligned.pairs[0].observed, 1);
  assert.equal(aligned.pairs[1].observed, 2);
  assert.deepEqual(aligned.extras, [0]);
});

test('paraphrased failures are rescued inside their order window', () => {
  const sim = fixtureEvents('loop-1/simulator.ndjson');
  const j = loadJourney(JOURNEY);
  const aligned = alignSurfaces(j, { desktop: fixtureEvents('loop-1/desktop.ndjson').steps, simulator: sim.steps });
  const step4 = aligned.simulator.pairs.find((p) => p.anchor === 3);
  assert.notEqual(step4.observed, null, 'the discount step should be matched, not left absent');
});

test('a split is a pass on one surface and a failure on the other', () => {
  const j = loadJourney(JOURNEY);
  const desktop = fixtureEvents('loop-1/desktop.ndjson').steps;
  const simulator = fixtureEvents('loop-1/simulator.ndjson').steps;
  const aligned = alignSurfaces(j, { desktop, simulator });
  const result = classifyDivergences(
    j,
    aligned,
    { desktop, simulator },
    { desktop: { ok: true, exitCode: 0 }, simulator: { ok: false, exitCode: 1 } },
  );
  assert.equal(result.summary.split, 2);
  assert.equal(result.converged, false);
  const splitSteps = result.rows.filter((r) => r.divergence === DIVERGENCE.SPLIT).map((r) => r.n);
  assert.deepEqual(splitSteps, [4, 5]);
});

test('a surface that never ran is an error, not a pass', () => {
  const j = loadJourney(JOURNEY);
  const desktop = fixtureEvents('loop-1/desktop.ndjson').steps;
  const aligned = alignSurfaces(j, { desktop, simulator: [] });
  const result = classifyDivergences(
    j,
    aligned,
    { desktop, simulator: [] },
    { desktop: { ok: true, exitCode: 0 }, simulator: { ok: false, exitCode: 127, status: 'not-run' } },
  );
  assert.equal(result.summary.error, 6);
  assert.equal(result.converged, false);
});

test('agreement in failure is still not proof', () => {
  const j = loadJourney(JOURNEY);
  const both = fixtureEvents('loop-1/simulator.ndjson').steps;
  const aligned = alignSurfaces(j, { desktop: both, simulator: both });
  const result = classifyDivergences(
    j,
    aligned,
    { desktop: both, simulator: both },
    { desktop: { ok: false, exitCode: 1 }, simulator: { ok: false, exitCode: 1 } },
  );
  assert.equal(result.summary.agreedFail, 2);
  assert.equal(result.converged, false);
});

test('brief lists only disagreeing steps and forbids editing the journey', () => {
  const j = loadJourney(JOURNEY);
  const desktop = fixtureEvents('loop-1/desktop.ndjson').steps;
  const simulator = fixtureEvents('loop-1/simulator.ndjson').steps;
  const aligned = alignSurfaces(j, { desktop, simulator });
  const div = classifyDivergences(j, aligned, { desktop, simulator }, {
    desktop: { ok: true, exitCode: 0 },
    simulator: { ok: false, exitCode: 1 },
  });
  const brief = buildBrief({ journey: j, divergence: div, artifactDir: '/tmp/x' });
  assert.match(brief.markdown, /Do not edit it/);
  assert.match(brief.markdown, /## Step 4/);
  assert.match(brief.markdown, /## Step 5/);
  assert.doesNotMatch(brief.markdown, /## Step 1 /);
  assert.equal(brief.json.findings.length, 2);
});

test('report names both surfaces and the evidence hashes', () => {
  const j = loadJourney(JOURNEY);
  const desktop = fixtureEvents('loop-1/desktop.ndjson').steps;
  const simulator = fixtureEvents('loop-1/simulator.ndjson').steps;
  const aligned = alignSurfaces(j, { desktop, simulator });
  const div = classifyDivergences(j, aligned, { desktop, simulator }, {
    desktop: { ok: true, exitCode: 0, durationMs: 1200, steps: desktop },
    simulator: { ok: false, exitCode: 1, durationMs: 900, steps: simulator },
  });
  const md = renderMarkdown({
    journey: j,
    divergence: div,
    rows: div.rows,
    summary: div.summary,
    runs: { desktop: { ok: true, exitCode: 0, steps: desktop, durationMs: 1200 }, simulator: { ok: false, exitCode: 1, steps: simulator, durationMs: 900 } },
    pack: { path: '/tmp/p.evidence', sha256: 'abc123' },
    artifacts: { dir: '/tmp/art' },
  });
  assert.match(md, /Verdict: diverged/);
  assert.match(md, /abc123/);
  assert.match(md, /\| 4 \|/);
});

test('normalizing junk never invents a pass', () => {
  const n = normalizeEvents(['not json at all', '{"type":"run_end","status":"failed"}']);
  assert.equal(n.steps.length, 0);
  assert.equal(n.verdict, 'failed');
});
