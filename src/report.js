// Two renderings of the same truth: a table a human reads in the terminal and
// a markdown report that travels with the pack.
import { table, green, red, yellow, dim, bold, cyan, truncate } from './util.js';
import { DIVERGENCE, STATUS } from './diverge.js';

function cell(side) {
  switch (side.status) {
    case STATUS.PASS:
      return 'pass';
    case STATUS.FAIL:
      return 'FAIL';
    case STATUS.MISSING:
      return 'absent';
    case STATUS.ERROR:
      return 'error';
    case STATUS.SKIPPED:
      return 'skipped';
    default:
      return '??';
  }
}

function divergenceLabel(div) {
  switch (div) {
    case DIVERGENCE.AGREED_PASS:
      return 'agree';
    case DIVERGENCE.AGREED_FAIL:
      return 'both fail';
    case DIVERGENCE.SPLIT:
      return 'SPLIT';
    case DIVERGENCE.UNPROVEN:
      return 'unproven';
    default:
      return 'error';
  }
}

export function renderTerminal(result) {
  const { rows, summary, runs, journey, pack, artifacts } = result;
  const out = [];

  const dRun = runs.desktop || {};
  const sRun = runs.simulator || {};
  out.push('');
  out.push(bold(`Both Ends · ${journey?.title || 'journey'}`));
  out.push(
    dim(
      `desktop   ${dRun.ok ? green('ran') : red('failed')}  ${dRun.steps?.length ?? 0} steps  ${Math.round((dRun.durationMs || 0) / 1000)}s` +
        `   |   simulator ${sRun.ok ? green('ran') : red('failed')}  ${sRun.steps?.length ?? 0} steps  ${Math.round((sRun.durationMs || 0) / 1000)}s`,
    ),
  );
  out.push('');

  const t = table(
    ['#', 'journey step', 'desktop', 'simulator', 'divergence'],
    rows.map((r) => [
      String(r.n),
      truncate(r.anchor, 46),
      cell(r.desktop),
      cell(r.simulator),
      divergenceLabel(r.divergence),
    ]),
  );
  out.push(t);
  out.push('');

  const line = `${summary.agreedPass}/${summary.steps} agree on both surfaces`;
  const tail = [];
  if (summary.split) tail.push(red(`${summary.split} split`));
  if (summary.agreedFail) tail.push(red(`${summary.agreedFail} fail on both`));
  if (summary.unproven) tail.push(yellow(`${summary.unproven} unproven`));
  if (summary.error) tail.push(red(`${summary.error} error`));
  out.push(`${convergedBadge(summary)} ${line}${tail.length ? '  ·  ' + tail.join('  ·  ') : ''}`);

  const extraLines = Object.entries(result.extras || {})
    .filter(([, list]) => list?.length)
    .map(([surface, list]) => `${list.length} on ${surface}: ${list.map((e) => truncate(e.text, 40)).join(' · ')}`);
  for (const line of extraLines) out.push(dim(`dropped   ${line}`));

  if (pack?.path) out.push(dim(`pack      ${pack.path}${pack.sha256 ? `  sha256:${pack.sha256.slice(0, 12)}` : ''}`));
  if (artifacts?.dir) out.push(dim(`artifacts ${artifacts.dir}`));
  out.push('');
  return out.join('\n');
}

function convergedBadge(summary) {
  const clean = summary.split === 0 && summary.agreedFail === 0 && summary.unproven === 0 && summary.error === 0;
  return clean ? green('CONVERGED') : red('DIVERGED ');
}

export function renderMarkdown(result) {
  const { rows, summary, runs, journey, pack, artifacts, loopHistory } = result;
  const clean = summary.split === 0 && summary.agreedFail === 0 && summary.unproven === 0 && summary.error === 0;
  const L = [];

  L.push(`# Both Ends — ${journey?.title || journey?.id}`);
  L.push('');
  L.push(`**Verdict: ${clean ? 'converged' : 'diverged'}** · ${summary.agreedPass}/${summary.steps} steps agree on both surfaces.`);
  L.push('');
  if (journey?.why) {
    L.push(journey.why);
    L.push('');
  }

  L.push('## The two runs');
  L.push('');
  for (const surface of ['desktop', 'simulator']) {
    const r = runs[surface] || {};
    L.push(
      `- **${surface}** — ${r.ok ? 'completed' : 'failed'} (exit ${r.exitCode ?? '?'}) · ${r.steps?.length ?? 0} steps · ${Math.round((r.durationMs || 0) / 1000)}s${r.runId ? ` · run ${r.runId}` : ''}`,
    );
    if (r.packPath) L.push(`  - pack: \`${r.packPath}\``);
  }
  L.push('');

  L.push('## Aligned steps');
  L.push('');
  L.push('| # | journey step | desktop | simulator | divergence |');
  L.push('|---|--------------|---------|-----------|------------|');
  for (const r of rows) {
    L.push(`| ${r.n} | ${r.anchor.replace(/\|/g, '\\|')} | ${cell(r.desktop)} | ${cell(r.simulator)} | ${divergenceLabel(r.divergence)} |`);
  }
  L.push('');
  L.push('Steps are compared through the journey, not by index: a browser run and a');
  L.push('simulator run do not perform the same number of steps.');
  L.push('');
  const extraList = Object.entries(result.extras || {}).filter(([, v]) => v?.length);
  if (extraList.length) {
    L.push('Observations with no journey step (dropped, not counted as divergence):');
    L.push('');
    for (const [surface, list] of extraList) {
      for (const e of list) L.push(`- ${surface}: ${truncate(e.text, 120)} (\`${e.status || 'seen'}\`)`);
    }
    L.push('');
  }

  const findings = result.rows.filter((r) => r.divergence !== DIVERGENCE.AGREED_PASS);
  if (findings.length) {
    L.push('## Findings');
    L.push('');
    for (const f of findings) {
      L.push(`### ${f.n}. ${f.anchor}`);
      L.push('');
      L.push(`- desktop: ${cell(f.desktop)}${f.desktop.text ? ` — ${truncate(f.desktop.text, 180)}` : ''}`);
      L.push(`- simulator: ${cell(f.simulator)}${f.simulator.text ? ` — ${truncate(f.simulator.text, 180)}` : ''}`);
      L.push(`- class: \`${f.divergence}\``);
      L.push('');
    }
  }

  if (loopHistory?.length) {
    L.push('## Loop');
    L.push('');
    L.push('| loop | splits | agree | outcome |');
    L.push('|------|--------|-------|---------|');
    for (const h of loopHistory) {
      L.push(`| ${h.loop} | ${h.split} | ${h.agreedPass}/${h.steps} | ${h.converged ? 'converged' : 'still diverged'} |`);
    }
    L.push('');
  }

  L.push('## Proof');
  L.push('');
  if (pack?.path) {
    L.push(`- sealed pack: \`${pack.path}\``);
    if (pack.sha256) L.push(`- sha256: \`${pack.sha256}\``);
    if (pack.report) L.push(`- merge report: \`${JSON.stringify(pack.report)}\``);
  } else {
    L.push('- no merged pack (fixture or failed runs — see replay/ for raw events)');
  }
  if (artifacts?.dir) L.push(`- artifacts: \`${artifacts.dir}\``);
  L.push('');

  return L.join('\n');
}
