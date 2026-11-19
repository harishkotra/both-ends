// The closed loop: prove → brief → fix → prove again → count the loops.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { runBothEnds } from './run.js';
import { buildBrief } from './brief.js';
import { renderTerminal, renderMarkdown } from './report.js';
import { writeArtifacts } from './evidence.js';
import { ensureDir, writeText, green, red, dim, bold } from './util.js';

function sh(command, cwd) {
  return new Promise((res) => {
    const child = spawn('/bin/sh', ['-lc', command], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', (e) => res({ code: 127, out: String(e.message || e) }));
    child.on('close', (code) => res({ code: code ?? 1, out }));
  });
}

/**
 * @param {object} opts
 * @param {string} opts.journeyPath
 * @param {string} [opts.workdir]
 * @param {string|null} [opts.fakeDirs]  fixture set per loop: fakeDirs[i]
 * @param {number} [opts.maxLoops]
 * @param {string|null} [opts.fixCommand] shell command that hands the brief to an agent
 * @param {string|null} [opts.rebuildCommand] rebuild the app under test before rerunning
 * @param {string} [opts.outDir]
 */
export async function runLoop(opts) {
  const {
    journeyPath,
    workdir = process.cwd(),
    fakeDirs = null,
    maxLoops = 3,
    fixCommand = null,
    rebuildCommand = null,
    outDir = join(workdir, '.both-ends'),
    log = console.log,
    verbose = false,
  } = opts;

  const history = [];
  let last = null;

  for (let loop = 1; loop <= maxLoops; loop += 1) {
    const fakeDir = fakeDirs ? fakeDirs[Math.min(loop - 1, fakeDirs.length - 1)] : null;
    const result = await runBothEnds({
      journeyPath,
      workdir,
      fakeDir,
      outDir,
      verbose,
      log,
      skipMerge: Boolean(fakeDir),
    });

    const { summary, converged } = result.divergence;
    history.push({
      loop,
      split: summary.split,
      agreedPass: summary.agreedPass,
      steps: summary.steps,
      converged,
      durationMs: Object.values(result.runs).reduce((a, r) => a + (r.durationMs || 0), 0),
    });

    // Persist this loop's brief + report next to its artifacts.
    const brief = buildBrief({
      journey: result.journey,
      divergence: result.divergence,
      artifactDir: result.artifacts.dir,
      loop,
      rerunCommand: `npx both-ends loop ${journeyPath} --max-loops ${maxLoops}`,
    });
    writeText(join(result.artifacts.dir, 'brief.md'), brief.markdown);
    writeText(join(result.artifacts.dir, 'brief.json'), JSON.stringify(brief.json, null, 2));

    const reportMd = renderMarkdown({ ...result, loopHistory: history });
    writeArtifacts(result.artifacts.dir, {
      divergence: { ...result.divergence, journey: result.journey.id, runId: result.runId },
      report: reportMd,
      runs: result.runs,
      merged: result.merged,
      policyPath: result.journey.policy || null,
    });

    result.brief = brief;
    result.divergence.loopHistory = history;
    last = result;

    log(renderTerminal(result));
    log(dim(`brief → ${join(result.artifacts.dir, 'brief.md')}`));

    if (converged) {
      log(green(`converged after ${loop} loop${loop === 1 ? '' : 's'}`));
      return { ...result, loopHistory: history, loops: loop, converged: true };
    }
    if (loop === maxLoops) break;

    if (fixCommand) {
      log(bold(`\nloop ${loop}: handing the brief to the agent`));
      log(dim(fixCommand));
      const fix = await sh(fixCommand, workdir);
      if (fix.code !== 0) {
        log(red(`fix command exited ${fix.code}`));
        if (verbose) log(dim(fix.out));
      }
    }
    if (rebuildCommand) {
      log(dim(`rebuilding: ${rebuildCommand}`));
      const rb = await sh(rebuildCommand, workdir);
      if (rb.code !== 0) {
        log(red(`rebuild failed (${rb.code})`));
        if (verbose) log(dim(rb.out));
      }
    }
  }

  log(red(`still diverged after ${maxLoops} loop${maxLoops === 1 ? '' : 's'}`));
  return { ...last, loopHistory: history, loops: maxLoops, converged: false };
}
