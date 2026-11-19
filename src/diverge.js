// Divergence: where the two surfaces stop telling the same story.
//
// One row per named journey step, one column per surface. The interesting row
// is SPLIT — the same journey step passes on one surface and fails on the
// other. That is the class of bug a web-only suite cannot see and a mobile-only
// suite cannot see either.

export const STATUS = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  MISSING: 'MISSING',
  SKIPPED: 'SKIPPED',
  ERROR: 'ERROR',
  UNKNOWN: 'UNKNOWN',
});

export const DIVERGENCE = Object.freeze({
  AGREED_PASS: 'agreed-pass',
  AGREED_FAIL: 'agreed-fail',
  SPLIT: 'split',
  UNPROVEN: 'unproven',
  ERROR: 'error',
});

const norm = (s) => String(s ?? '').trim().toLowerCase();

export function normalizeStatus(raw) {
  const v = norm(raw);
  if (!v) return STATUS.UNKNOWN;
  if (['pass', 'passed', 'ok', 'success', 'succeeded', 'true', 'green'].includes(v)) return STATUS.PASS;
  if (['fail', 'failed', 'error', 'false', 'red', 'bug'].includes(v)) return STATUS.FAIL;
  if (['skip', 'skipped', 'not_run', 'notrun'].includes(v)) return STATUS.SKIPPED;
  if (['broken', 'unknown', 'ambiguous'].includes(v)) return STATUS.UNKNOWN;
  return STATUS.UNKNOWN;
}

function sideFor(surface, pair, observed, run) {
  if (!run || run.status === 'not-run') {
    return { status: STATUS.ERROR, text: 'surface was not executed', detail: run?.error || '' };
  }
  if (run.exitCode !== 0 && run.failureBeforeSteps) {
    return { status: STATUS.ERROR, text: 'run failed before any step', detail: run.error || '' };
  }
  if (pair.observed === null || pair.observed === undefined) {
    return {
      status: run.ok ? STATUS.MISSING : STATUS.ERROR,
      text: 'not observed on this surface',
      detail: run.ok
        ? 'the journey step never appeared in this surface\'s run'
        : `run ended with exit ${run.exitCode}`,
    };
  }
  const rec = observed[pair.observed];
  const status = normalizeStatus(rec.status);
  return {
    status: status === STATUS.UNKNOWN && run.ok ? STATUS.PASS : status,
    text: rec.text || '',
    detail: rec.detail || '',
    confidence: pair.score,
  };
}

function classify(desktop, simulator, expectation) {
  const d = desktop.status;
  const s = simulator.status;
  if (d === STATUS.ERROR || s === STATUS.ERROR) return DIVERGENCE.ERROR;
  if (d === STATUS.MISSING || s === STATUS.MISSING || d === STATUS.UNKNOWN || s === STATUS.UNKNOWN) {
    return DIVERGENCE.UNPROVEN;
  }
  if (d === s) {
    const wanted = normalizeStatus(expectation);
    return d === wanted ? DIVERGENCE.AGREED_PASS : DIVERGENCE.AGREED_FAIL;
  }
  // A pass on one surface and a non-pass on the other is the finding.
  if (d === STATUS.PASS || s === STATUS.PASS) return DIVERGENCE.SPLIT;
  return DIVERGENCE.UNPROVEN;
}

const SEVERITY = {
  [DIVERGENCE.SPLIT]: 3,
  [DIVERGENCE.ERROR]: 2,
  [DIVERGENCE.UNPROVEN]: 1,
  [DIVERGENCE.AGREED_FAIL]: 2,
  [DIVERGENCE.AGREED_PASS]: 0,
};

/**
 * @param {object} journey parsed journey
 * @param {object} aligned  output of alignSurfaces()
 * @param {{desktop:object, simulator:object}} observedBySurface normalized steps
 * @param {{desktop:object, simulator:object}} runs run metadata incl. exitCode/ok
 */
export function classifyDivergences(journey, aligned, observedBySurface, runs) {
  const rows = [];
  for (const step of journey.steps) {
    const pair = aligned.desktop?.pairs?.find((p) => p.anchor === step.n - 1) || { observed: null, score: 0 };
    const pairSim = aligned.simulator?.pairs?.find((p) => p.anchor === step.n - 1) || { observed: null, score: 0 };

    const desktop = sideFor('desktop', pair, observedBySurface.desktop || [], runs.desktop);
    const simulator = sideFor('simulator', pairSim, observedBySurface.simulator || [], runs.simulator);
    const divergence = classify(desktop, simulator, step.expect);

    rows.push({
      n: step.n,
      anchor: step.anchor,
      expectation: step.expect,
      desktop,
      simulator,
      divergence,
      severity: SEVERITY[divergence] ?? 1,
    });
  }

  const count = (value) => rows.filter((r) => r.divergence === value).length;
  const summary = {
    steps: rows.length,
    agreedPass: count(DIVERGENCE.AGREED_PASS),
    agreedFail: count(DIVERGENCE.AGREED_FAIL),
    split: count(DIVERGENCE.SPLIT),
    unproven: count(DIVERGENCE.UNPROVEN),
    error: count(DIVERGENCE.ERROR),
    extras: {
      desktop: (aligned.desktop?.extras || []).length,
      simulator: (aligned.simulator?.extras || []).length,
    },
  };

  const converged =
    summary.split === 0 &&
    summary.agreedFail === 0 &&
    summary.unproven === 0 &&
    summary.error === 0;

  return {
    rows,
    summary,
    converged,
    findings: rows.filter((r) => r.divergence !== DIVERGENCE.AGREED_PASS).sort((a, b) => b.severity - a.severity),
  };
}

/** Steps a surface performed that the journey never asked for (informational). */
export function describeExtras(journey, aligned, observedBySurface) {
  const out = {};
  for (const surface of journey.surfaces) {
    const obs = observedBySurface[surface] || [];
    out[surface] = (aligned[surface]?.extras || []).map((idx) => ({
      index: obs[idx]?.index ?? idx,
      text: obs[idx]?.text ?? '',
      status: obs[idx]?.status ?? '',
    }));
  }
  return out;
}
