// One pass over both surfaces, start to sealed pack.
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { loadJourney } from './journey.js';
import { runSurface, kaneVersion } from './kane.js';
import { alignSurfaces } from './align.js';
import { classifyDivergences, describeExtras } from './diverge.js';
import { mergeEvidence, writeArtifacts } from './evidence.js';
import { shortId, ensureDir, dim } from './util.js';

/**
 * @param {object} opts
 * @param {string} opts.journeyPath
 * @param {string} [opts.workdir]
 * @param {string|null} [opts.fakeDir]  replay fixtures instead of kane-cli
 * @param {string} [opts.outDir]        where report.json / replay / SEAL go
 * @param {boolean} [opts.verbose]
 * @param {string} [opts.label]         subdirectory label (loop number)
 */
export async function runBothEnds(opts) {
  const {
    journeyPath,
    workdir = process.cwd(),
    fakeDir = null,
    outDir = join(workdir, '.both-ends'),
    verbose = false,
    log = () => {},
    skipMerge = false,
  } = opts;

  const journey = loadJourney(journeyPath);
  const runId = shortId(`both-ends-${journey.id.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`);
  const artDir = ensureDir(join(outDir, runId));
  const policyPath = journey.policy || join(journey.dir, '..', 'policies', 'both-ends.yaml');

  const runs = {};
  const observedBySurface = {};

  for (const surface of journey.surfaces) {
    const surfaceFake = fakeDir ? resolveFake(fakeDir, surface) : null;
    log(dim(`running ${surface}${surfaceFake?.dir ? ` (fixture ${surfaceFake.dir})` : ''}…`));
    const run = await runSurface({
      surface,
      journey,
      workdir,
      fakeDir: surfaceFake ? surfaceFake.dir : null,
      appiumUrl: journey.appium || null,
      onLine: verbose ? (l) => log(dim(`  ${surface}: ${l}`)) : undefined,
    });
    runs[surface] = run;
    observedBySurface[surface] = run.steps || [];
  }

  const aligned = alignSurfaces(journey, observedBySurface);
  const divergence = classifyDivergences(journey, aligned, observedBySurface, runs);
  const extras = describeExtras(journey, aligned, observedBySurface);

  let merged = null;
  const packs = Object.values(runs).map((r) => r.packPath).filter(Boolean);
  if (!skipMerge && packs.length) {
    log(dim(`merging ${packs.length} pack(s)…`));
    merged = await mergeEvidence({
      packs,
      runId,
      outPath: join(artDir, `${runId}.evidence`),
      policyPath,
      cwd: workdir,
      title: journey.title,
    });
    if (!merged.ok) log(dim(`merge: ${merged.error}`));
  }

  const result = {
    runId,
    journey,
    runs,
    aligned,
    divergence,
    summary: divergence.summary,
    rows: divergence.rows,
    extras,
    merged,
    pack: merged,
    artifacts: { dir: artDir },
    generatedAt: new Date().toISOString(),
    kaneVersion: await withTimeout(kaneVersion(), 4000),
    fake: Boolean(fakeDir),
  };
  return result;
}

function resolveFake(fakeDir, surface) {
  if (!fakeDir) return null;
  const has = (dir) => existsSync(join(dir, `${surface}.ndjson`));
  // Accept the short name too: --fake loop-1 finds fixtures/demo/loop-1.
  const candidates = [fakeDir, join('fixtures', 'demo', fakeDir)];
  for (const dir of candidates) {
    if (has(dir)) return { dir };
  }
  return { dir: fakeDir };
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((r) => setTimeout(() => r(null), ms))]);
}
