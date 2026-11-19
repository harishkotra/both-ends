// What the coding agent gets to see: only the steps where the two surfaces
// disagree, with enough context to fix the code and nothing to argue with.
import { truncate } from './util.js';
import { DIVERGENCE } from './diverge.js';

const STATUS_ICON = { PASS: 'ok', FAIL: 'FAIL', MISSING: 'absent', ERROR: 'error', UNKNOWN: 'unknown', SKIPPED: 'skipped' };

function lineFor(side) {
  const icon = STATUS_ICON[side.status] || side.status;
  return `${icon}${side.text ? ` — ${truncate(side.text, 140)}` : ''}`;
}

/**
 * A repair brief is a small, deterministic document. Same divergence in, same
 * brief out — so an agent's fix can be diffed against what was asked for.
 */
export function buildBrief({ journey, divergence, artifactDir, loop = 1, rerunCommand }) {
  const findings = divergence.findings;
  const splits = findings.filter((f) => f.divergence === DIVERGENCE.SPLIT);

  const head = [
    `# Repair brief — ${journey.title}`,
    '',
    `Loop ${loop}. ${splits.length} step(s) pass on one surface and not the other.`,
    `${divergence.summary.agreedPass}/${divergence.summary.steps} journey steps agree on both surfaces.`,
    '',
    'The journey file is the contract. Do not edit it, and do not make one surface',
    'match the other by weakening the assertion — fix the surface that disagrees.',
    '',
  ];

  const body = [];
  for (const f of findings) {
    body.push(`## Step ${f.n} — ${f.anchor}`);
    body.push('');
    body.push(`- divergence: **${f.divergence}**`);
    body.push(`- desktop:   ${lineFor(f.desktop)}`);
    body.push(`- simulator: ${lineFor(f.simulator)}`);
    if (f.desktop.detail) body.push(`- desktop detail: ${truncate(f.desktop.detail, 200)}`);
    if (f.simulator.detail) body.push(`- simulator detail: ${truncate(f.simulator.detail, 200)}`);
    body.push('');
  }

  const tail = [
    '## Where the evidence is',
    '',
    `- divergence report: ${artifactDir ? `${artifactDir}/divergence.json` : 'divergence.json'}`,
    `- raw runs: ${artifactDir ? `${artifactDir}/replay/` : 'replay/'} (one NDJSON per surface)`,
    '',
    '## How this will be judged',
    '',
    'Rerun the same journey: the step above must pass on **both** surfaces, and',
    'no previously passing step may regress. The rerun is the only acceptance test.',
    '',
  ];
  if (rerunCommand) {
    tail.push('```sh', rerunCommand, '```', '');
  }

  const text = [...head, ...body, ...tail].join('\n');

  // A compact machine twin: agents that take JSON do better with step ids than prose.
  const json = {
    journey: journey.id,
    loop,
    contract: 'journey file is read-only',
    findings: findings.map((f) => ({
      step: f.n,
      anchor: f.anchor,
      divergence: f.divergence,
      desktop: f.desktop.status,
      simulator: f.simulator.status,
      expectation: f.expectation,
    })),
    artifacts: artifactDir || null,
  };

  return { markdown: text, json };
}

/** Token-lean variant for a single agent turn (used by --brief-only). */
export function briefDigest(brief) {
  return brief.json.findings
    .map((f) => `step ${f.step} "${f.anchor}": desktop=${f.desktop} simulator=${f.simulator}`)
    .join('\n');
}
