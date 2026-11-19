import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, existsSync, readFileSync, copyFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mergeEvidence, lintPolicy } from '../src/evidence.js';
import { runSurface, saveRun, KANE_BIN } from '../src/kane.js';
import { loadJourney } from '../src/journey.js';
import { normalizeStatus } from '../src/diverge.js';
import { runLoop } from '../src/loop.js';

const ROOT = resolve(import.meta.dirname, '..');
const JOURNEY = join(ROOT, 'journeys/place-order-two-ends.journey.md');
const STUB = join(ROOT, 'test/stub-kane.sh');
chmodSync(STUB, 0o755);
process.env.BOTH_ENDS_KANE = STUB;

test('the kane-cli path is overridable so tests never need an account', () => {
  assert.equal(KANE_BIN(), STUB);
});

test('policy lint surfaces the tool verdict, not a guess', async () => {
  const r = await lintPolicy(join(ROOT, 'policies/both-ends.yaml'), ROOT);
  assert.equal(r.ok, true);
  assert.match(r.output, /ok/);
});

test('merge hands the pack format to kane-cli and hashes what came back', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'be-merge-'));
  const a = join(dir, 'a.ndjson');
  const b = join(dir, 'b.ndjson');
  copyFileSync(join(ROOT, 'fixtures/demo/loop-1/desktop.ndjson'), a);
  copyFileSync(join(ROOT, 'fixtures/demo/loop-1/simulator.ndjson'), b);
  const out = join(dir, 'merged.evidence');
  const merged = await mergeEvidence({
    packs: [a, b],
    runId: 'test-run',
    outPath: out,
    policyPath: join(ROOT, 'policies/both-ends.yaml'),
    cwd: ROOT,
  });
  assert.equal(merged.ok, true, merged.stderr);
  assert.equal(existsSync(out), true);
  assert.match(merged.sha256, /^[a-f0-9]{64}$/);
  assert.equal(merged.report.run_id, 'stub-run');
});

test('runSurface records raw ndjson next to the normalized steps', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'be-run-'));
  const r = await runSurface({
    surface: 'simulator',
    journey: loadJourney(JOURNEY),
    workdir: ROOT,
  });
  assert.equal(r.exitCode, 1);
  assert.equal(r.ok, false);
  assert.equal(r.steps.length, 8);
  assert.equal(r.steps.filter((s) => normalizeStatus(s.status) === 'FAIL').length, 2);
  assert.ok(r.raw.join('\n').includes('"type":"run_end"'));
  const saved = saveRun(r, dir);
  assert.equal(existsSync(saved.file), true);
  assert.match(readFileSync(saved.file, 'utf8'), /run_end/);
});

test('the loop closes only when the second run agrees', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'be-loop-'));
  const result = await runLoop({
    journeyPath: JOURNEY,
    workdir: ROOT,
    outDir: dir,
    maxLoops: 3,
    fakeDirs: [join(ROOT, 'fixtures/demo/loop-1'), join(ROOT, 'fixtures/demo/loop-2')],
    fixCommand: null,
    rebuildCommand: null,
    log: () => {},
  });
  assert.equal(result.converged, true);
  assert.equal(result.loops, 2);
  assert.equal(result.loopHistory.length, 2);
  assert.equal(result.loopHistory[0].split, 2);
  assert.equal(result.loopHistory[1].split, 0);
  const artifactDirs = readdirSync(dir).filter((d) => d.startsWith('both-ends-'));
  assert.equal(artifactDirs.length, 2, 'one artifact directory per loop');
  for (const d of artifactDirs) assert.equal(existsSync(join(dir, d, 'brief.md')), true);
  const seal = JSON.parse(readFileSync(join(dir, artifactDirs[0], 'SEAL.json'), 'utf8'));
  assert.equal(seal.journey, 'place-order-two-ends');
  assert.ok(seal.artifacts.every((a) => /^[a-f0-9]{64}$/.test(a.sha256)));
});
