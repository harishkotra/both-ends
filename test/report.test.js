import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHtml } from '../src/html.js';
import { lintJourney } from '../src/journey-lint.js';
import { loadJourney } from '../src/journey.js';

const journey = loadJourney('journeys/place-order-two-ends.journey.md');

const result = {
  journey: { id: journey.id, title: journey.title },
  summary: { steps: 6, agreedPass: 4, split: 2, agreedFail: 0, unproven: 0, error: 0 },
  rows: [
    { n: 1, anchor: 'cart badge shows 1 item', desktop: { status: 'PASS' }, simulator: { status: 'PASS' }, divergence: 'agreed-pass' },
    { n: 4, anchor: 'discount line shows 6.25', desktop: { status: 'PASS', text: 'a discount of 6.25' }, simulator: { status: 'FAIL', text: 'a discount of 0.06' }, divergence: 'split' },
  ],
  runs: { desktop: { ok: true, exitCode: 0, steps: [1, 2], durationMs: 1000 }, simulator: { ok: false, exitCode: 1, steps: [1], durationMs: 2000 } },
  pack: { path: '/tmp/x.evidence', sha256: 'a'.repeat(64) },
  artifacts: { dir: '/tmp/art' },
  loopHistory: [{ loop: 1, split: 2, agreedPass: 4, steps: 6, converged: false }],
};

test('html report carries the verdict, the rows and the seal', () => {
  const html = renderHtml(result);
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /DIVERGED|diverged/);
  assert.match(html, /discount line shows 6\.25/);
  assert.match(html, /SPLIT/);
  assert.match(html, /a discount of 0\.06/);
  assert.match(html, new RegExp('a'.repeat(64)));
  assert.match(html, /still diverged/);
  // self-contained: no external asset requests
  assert.doesNotMatch(html, /<script/);
  assert.doesNotMatch(html, /https?:\/\/[^"']*\.(?:js|css)/);
});

test('html escapes journey text instead of injecting it', () => {
  const html = renderHtml({ ...result, rows: [{ n: 1, anchor: '<img src=x onerror=alert(1)>', desktop: { status: 'PASS' }, simulator: { status: 'PASS' }, divergence: 'agreed-pass' }] });
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
});

test('a converged result reads as converged', () => {
  const html = renderHtml({ ...result, summary: { steps: 6, agreedPass: 6, split: 0 }, rows: [] });
  assert.match(html, /converged/);
  assert.doesNotMatch(html, /SPLIT/);
});

test('the real journey lints clean', () => {
  const report = lintJourney(journey);
  assert.deepEqual(report.problems, []);
  assert.equal(report.steps, 6);
  assert.deepEqual(report.surfaces, ['desktop', 'simulator']);
});

test('lint catches the mistakes that waste a run', () => {
  const broken = {
    ...journey,
    url: '',
    steps: [
      { n: 1, anchor: 'same thing', perSurface: { desktop: 'x' } },
      { n: 2, anchor: 'same thing', perSurface: { desktop: 'x', simulator: 'y' } },
      { n: 3, anchor: '', perSurface: { desktop: 'x', simulator: 'y' } },
    ],
  };
  const report = lintJourney(broken);
  assert.equal(report.ok, false);
  assert.ok(report.problems.some((p) => /no anchor/.test(p)));
  assert.ok(report.problems.some((p) => /duplicates step 1/.test(p)));
  assert.ok(report.problems.some((p) => /no instruction for the simulator surface/.test(p)));
  assert.ok(report.problems.some((p) => /no url/.test(p)));
  assert.ok(report.warnings.some((w) => /no anchor contains a number/.test(w)));
});
