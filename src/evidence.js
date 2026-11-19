// Evidence: two runs in, one sealed pack out.
//
// kane-cli owns the pack format; both-ends never rewrites it. It merges the
// packs kane-cli produced, then seals its own divergence report alongside them
// and hashes every input so the claim "these two runs produced this verdict" is
// checkable after the fact.
import { spawn } from 'node:child_process';
import { existsSync, statSync, copyFileSync, readdirSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { KANE_BIN, stripAnsi } from './kane.js';
import { sha256File, ensureDir, writeText, nowIso } from './util.js';

function runKane(args, cwd) {
  return new Promise((res) => {
    const child = spawn(KANE_BIN(), args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => res({ code: 127, out, err: String(e.message || e) }));
    child.on('close', (code) => res({ code: code ?? 1, out, err }));
  });
}

export async function lintPolicy(policyPath, cwd = process.cwd()) {
  const r = await runKane(['evidence', 'lint-policy', policyPath], cwd);
  const text = stripAnsi(r.out + r.err).trim();
  return { ok: r.code === 0, output: text };
}

/**
 * Merge kane-cli packs into one sealed pack.
 * @returns {{ok:boolean, path:string|null, sha256:string|null, report:object|null, error:string|null}}
 */
export async function mergeEvidence({ packs, runId, outPath, policyPath, cwd = process.cwd(), title }) {
  if (!packs?.length) {
    return { ok: false, path: null, sha256: null, report: null, error: 'no packs to merge' };
  }
  const args = ['evidence', 'merge', ...packs, '--run-id', runId, '--json', '-o', outPath];
  if (policyPath && existsSync(policyPath)) args.push('--policy', policyPath);
  if (title) args.push('--title', title);

  const r = await runKane(args, cwd);
  const text = stripAnsi(r.out).trim();

  let report = null;
  for (const line of text.split(/\r?\n/).reverse()) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try {
      report = JSON.parse(t);
      break;
    } catch {
      /* keep looking */
    }
  }

  const candidates = [outPath, report?.path, report?.pack_path, report?.output]
    .filter(Boolean)
    .map((p) => (p.startsWith('/') ? p : resolve(cwd, p)));
  const sealed = candidates.find((p) => existsSync(p) && statSync(p).isFile()) || null;

  if (r.code !== 0 || !sealed) {
    return {
      ok: false,
      path: sealed,
      sha256: sealed ? sha256File(sealed) : null,
      report,
      error: truncateMiddle(stripAnsi(r.err || r.out) || `kane-cli evidence merge exited ${r.code}`, 600),
    };
  }

  return { ok: true, path: sealed, sha256: sha256File(sealed), report, error: null, args };
}

export function truncateMiddle(s, max) {
  const t = String(s).replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const half = Math.floor((max - 1) / 2);
  return `${t.slice(0, half)}…${t.slice(-half)}`;
}

/**
 * Write the human-facing sidecar next to a pack: divergence.json, report.md,
 * replay/*.ndjson, and a SEAL with hashes of everything that went in.
 */
export function writeArtifacts(dir, { divergence, report, runs, merged, policyPath }) {
  ensureDir(dir);
  const divergencePath = join(dir, 'divergence.json');
  const reportPath = join(dir, 'report.md');
  const replayDir = ensureDir(join(dir, 'replay'));

  writeText(divergencePath, JSON.stringify({ generatedAt: nowIso(), ...divergence }, null, 2));
  writeText(reportPath, report);

  const replays = [];
  for (const run of Object.values(runs)) {
    if (!run?.raw?.length) continue;
    const p = join(replayDir, `${run.surface}.ndjson`);
    writeText(p, run.raw.join('\n') + '\n');
    replays.push(p);
  }

  const manifest = {
    generatedAt: nowIso(),
    tool: 'both-ends',
    journey: divergence.journey,
    surfaces: Object.values(runs).map((r) => ({
      surface: r.surface,
      runId: r.runId,
      exitCode: r.exitCode,
      ok: r.ok,
      durationMs: r.durationMs,
      steps: r.steps?.length ?? 0,
      pack: r.packPath ? { path: r.packPath, sha256: sha256File(r.packPath) } : null,
    })),
    merged: merged?.path
      ? { path: merged.path, sha256: merged.sha256, report: merged.report ?? null }
      : null,
    policy: policyPath && existsSync(policyPath) ? { path: policyPath, sha256: sha256File(policyPath) } : null,
    artifacts: [divergencePath, reportPath, ...replays].map((p) => ({ path: p, sha256: sha256File(p) })),
    converged: divergence.converged,
  };

  const sealPath = join(dir, 'SEAL.json');
  writeText(sealPath, JSON.stringify(manifest, null, 2));
  return { dir, divergencePath, reportPath, sealPath, manifest };
}

/** Copy an existing pack into the run directory so a demo bundle travels whole. */
export function attachPack(dir, packPath) {
  if (!packPath || !existsSync(packPath)) return null;
  const target = join(dir, basename(packPath));
  copyFileSync(packPath, target);
  return target;
}

export function listPacks(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.evidence')).map((f) => join(dir, f));
}
