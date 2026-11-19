// The only place that talks to kane-cli.
//
// Everything here is deliberately thin: build argv, stream NDJSON, keep the
// raw lines (they are the evidence of what the agent actually did), and
// normalize them into step records the aligner can compare.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { nowIso, shortId, truncate, ensureDir, writeText } from './util.js';

export const KANE_BIN = () => process.env.BOTH_ENDS_KANE || 'kane-cli';

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

export function stripAnsi(s) {
  return String(s ?? '').replace(ANSI, '');
}

export function kaneVersion() {
  return new Promise((res) => {
    const p = spawn(KANE_BIN(), ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('error', () => res(null));
    p.on('close', () => {
      const m = stripAnsi(out).match(/(\d+\.\d+\.\d+)/);
      res(m ? m[1] : null);
    });
  });
}

const STEP_TYPES = new Set([
  'step', 'action', 'act', 'checkpoint', 'check', 'assertion', 'verify',
  'tool_call', 'tool', 'command', 'observation', 'screen', 'tap', 'click',
]);
const FINAL_TYPES = new Set(['run_end', 'runend', 'end', 'result', 'complete', 'completed', 'summary', 'final', 'verdict']);

function firstString(...vals) {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (v && typeof v === 'object') {
      const nested = firstString(v.text, v.description, v.name, v.title, v.label, v.action, v.goal, v.selector);
      if (nested) return nested;
    }
  }
  return '';
}

function pickStatus(obj) {
  if (typeof obj === 'boolean') return obj ? 'pass' : 'fail';
  return firstString(
    obj?.status,
    obj?.result,
    obj?.state,
    obj?.verdict,
    obj?.outcome,
    obj?.passed === true ? 'pass' : obj?.passed === false ? 'fail' : '',
    obj?.ok === true ? 'pass' : obj?.ok === false ? 'fail' : '',
    obj?.success === true ? 'pass' : obj?.success === false ? 'fail' : '',
    obj?.error ? 'fail' : '',
  );
}

/**
 * Normalize NDJSON (or prose) into ordered step records.
 * Tolerant by design: kane-cli's event schema is richer than anything both-ends
 * needs, and an unknown field must never become a silent pass.
 */
export function normalizeEvents(lines) {
  const steps = [];
  const notes = [];
  let runId = null;
  let verdict = null;
  let bug = null;
  let parsed = 0;

  for (const rawLine of lines) {
    const line = stripAnsi(rawLine).trim();
    if (!line) continue;
    let obj = null;
    if (line.startsWith('{')) {
      try {
        obj = JSON.parse(line);
        parsed += 1;
      } catch {
        obj = null;
      }
    }
    if (!obj) {
      const prose = line.replace(/^[✓✔✗✘•\-*>]\s*/, '');
      if (/^(✓|✔)/.test(line)) steps.push({ index: steps.length, text: prose, status: 'pass', source: 'prose' });
      else if (/^(✗|✘)/.test(line)) steps.push({ index: steps.length, text: prose, status: 'fail', source: 'prose' });
      else if (/bug|regression/i.test(line)) notes.push(truncate(line, 200));
      continue;
    }

    runId = runId || firstString(obj.run_id, obj.runId, obj.execution_id, obj.executionId, obj.session_id) || null;

    const type = String(obj.type ?? obj.kind ?? obj.event ?? obj.stage ?? '').toLowerCase();
    if (obj.bug && typeof obj.bug === 'object') bug = obj.bug;

    if (FINAL_TYPES.has(type) || obj.final === true) {
      const s = pickStatus(obj) || '';
      if (s) verdict = s;
      if (obj.bugs && Array.isArray(obj.bugs)) bug = obj.bugs[0] || bug;
      continue;
    }

    const looksLikeStep =
      STEP_TYPES.has(type) ||
      (obj.step !== undefined && obj.step !== null) ||
      (obj.action !== undefined && obj.index !== undefined);
    if (!looksLikeStep) continue;

    const text = firstString(
      obj.text, obj.description, obj.intent, obj.goal, obj.name, obj.title,
      obj.action, obj.command, obj.target, obj.selector, obj.step,
    );
    if (!text) continue;
    steps.push({
      index: steps.length,
      text,
      status: pickStatus(obj) || 'unknown',
      surfaceHint: String(obj.target_kind ?? obj.device ?? ''),
      source: 'ndjson',
    });
  }

  return {
    steps: steps.map((s, i) => ({ ...s, index: i })),
    runId,
    verdict,
    bug,
    notes,
    parsed,
    source: parsed > 0 ? 'ndjson' : steps.length > 0 ? 'prose' : 'empty',
  };
}

function newestPack(dir, sinceMs) {
  if (!existsSync(dir)) return null;
  let best = null;
  for (const name of readdirSync(dir)) {
    if (!/\.evidence$/.test(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.mtimeMs + 1500 < sinceMs) continue;
    if (!best || st.mtimeMs > best.mtimeMs) best = { path: p, mtimeMs: st.mtimeMs };
  }
  return best?.path || null;
}

export function buildArgs({ surface, journey, name, workdir }) {
  const args = ['run', '--agent', '--mode', 'agent'];
  args.push('--max-steps', String(journey.maxSteps));
  args.push('--timeout', String(journey.timeout));
  args.push('--name', name);
  args.push('--final-validation', 'on');
  args.push('--bug-detection', 'continue');

  if (surface === 'desktop') {
    if (journey.url) args.push('--url', journey.url);
  } else {
    args.push('--target', 'simulator');
    if (journey.app) args.push('--app', resolve(workdir || process.cwd(), journey.app));
    if (journey.device) args.push('--device-name', journey.device);
    if (journey.osVersion) args.push('--os-version', journey.osVersion);
  }

  const objective = journey.objective[surface] || '';
  if (!objective) throw new Error(`journey has no objective for surface ${surface}`);
  args.push(objective);
  return args;
}

/**
 * Execute one surface. Returns metadata plus the raw NDJSON for replay.
 */
export async function runSurface({ surface, journey, workdir = process.cwd(), onLine, fakeDir = null, appiumUrl = null }) {
  const name = `both-ends-${journey.id}-${surface}-${Date.now().toString(36)}`;
  const startedAt = Date.now();

  if (fakeDir) {
    const file = join(fakeDir, `${surface}.ndjson`);
    if (!existsSync(file)) throw new Error(`fake fixture missing for ${surface}: ${file}`);
    const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
    for (const l of lines) onLine?.(l);
    const normalized = normalizeEvents(lines);
    const failed = normalized.verdict === 'failed' || normalized.steps.some((s) => s.status === 'FAIL');
    return {
      surface, name, startedAt, endedAt: Date.now(), durationMs: Date.now() - startedAt,
      exitCode: failed ? 1 : 0, ok: !failed, args: [], raw: lines, ...normalized,
      packPath: null, source: 'fixture', runId: normalized.runId || name,
    };
  }

  const args = buildArgs({ surface, journey, name, workdir });
  const cwd = existenceSafe(workdir);
  const lines = [];

  const result = await new Promise((res) => {
    let child;
    try {
      child = spawn(KANE_BIN(), args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: appiumUrl ? { ...process.env, KANE_APPIUM_URL: appiumUrl } : process.env,
      });
    } catch (err) {
      return res({ exitCode: 127, ok: false, error: String(err.message || err) });
    }
    const push = (d) => {
      for (const line of String(d).split(/\r?\n/)) {
        if (!line.trim()) continue;
        lines.push(line);
        onLine?.(stripAnsi(line));
      }
    };
    child.stdout.on('data', push);
    child.stderr.on('data', push);
    child.on('error', (err) => res({ exitCode: 127, ok: false, error: String(err.message || err) }));
    child.on('close', (code) => res({ exitCode: code ?? 1, ok: code === 0 }));
  });

  const normalized = normalizeEvents(lines);
  const packDir = join(cwd, '.testmuai', 'evidence');
  const packPath = newestPack(packDir, startedAt);

  return {
    surface,
    name,
    startedAt,
    endedAt: Date.now(),
    durationMs: Date.now() - startedAt,
    args,
    raw: lines,
    packPath,
    source: 'kane',
    ...normalized,
    ...result,
    steps: normalized.steps,
    failureBeforeSteps: !result.ok && normalized.steps.length === 0,
  };
}

function existenceSafe(p) {
  return existsSync(p) ? p : process.cwd();
}

export function saveRun(run, dir) {
  ensureDir(dir);
  const file = join(dir, `${run.surface}.ndjson`);
  writeText(file, (run.raw || []).join('\n') + '\n');
  return { file, lines: run.raw };
}
