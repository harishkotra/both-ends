// Linting a journey, before it costs you two minutes of agent time.
//
// A journey is prose plus anchors; the failure mode is that prose drifts away
// from something checkable. This catches the cheap mistakes — a step with no
// anchor, an anchor no surface is told to verify, two steps asking the same
// question — so the expensive run is not spent discovering them.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const MIN_ANCHOR = 8;

export function lintJourney(journey, { checkPaths = false } = {}) {
  const problems = [];
  const warnings = [];
  const surfaces = journey.surfaces || [];

  if (!journey.id) problems.push('journey has no id');
  if (!surfaces.length) problems.push('journey declares no surfaces');
  for (const s of surfaces) {
    if (!['desktop', 'simulator'].includes(s)) problems.push(`unknown surface "${s}" (use desktop or simulator)`);
  }

  const steps = journey.steps || [];
  if (!steps.length) problems.push('journey has no steps');

  const seen = new Map();
  for (const [i, step] of steps.entries()) {
    const at = `step ${i + 1}`;
    if (!step.anchor) problems.push(`${at}: no anchor — nothing to verify against`);
    else if (step.anchor.length < MIN_ANCHOR) problems.push(`${at}: anchor "${step.anchor}" is too short to match reliably`);
    else if (seen.has(step.anchor)) problems.push(`${at}: anchor duplicates step ${seen.get(step.anchor) + 1} — the two will be indistinguishable in the diff`);
    else seen.set(step.anchor, i);

    for (const s of surfaces) {
      if (!step.perSurface?.[s]) problems.push(`${at}: no instruction for the ${s} surface`);
    }
    for (const key of Object.keys(step)) {
      if (['n', 'anchor', 'perSurface', 'expect', 'shared'].includes(key)) continue;
      warnings.push(`${at}: unrecognised key "${key}" (ignored)`);
    }
  }

  const anchorsWithNumbers = steps.filter((s) => /\d/.test(s.anchor || '')).length;
  if (steps.length && !anchorsWithNumbers) {
    warnings.push('no anchor contains a number — text-only anchors are the ones a paraphrase quietly breaks');
  }

  if (surfaces.includes('desktop') && !journey.url) problems.push('desktop surface declared but no url in frontmatter');
  if (surfaces.includes('simulator')) {
    if (!journey.app) problems.push('simulator surface declared but no app path in frontmatter');
    if (!journey.device) warnings.push('simulator surface has no device — kane-cli will pick one');
  }

  if (!journey.policy) warnings.push('no policy in frontmatter — npx both-ends lint policies/both-ends.yaml separately');
  else if (!existsSync(resolve(journey.dir, journey.policy)) && !existsSync(journey.policy)) {
    warnings.push(`policy not found at ${journey.policy}`);
  }

  if (!journey.why) warnings.push('no "why" section — the first thing a reviewer reads, and the cheapest thing to write');

  if (checkPaths) {
    if (journey.app && !existsSync(journey.app)) warnings.push(`app bundle not built yet: ${journey.app}`);
    if (journey.url && !/^https?:\/\//.test(journey.url)) problems.push(`url is not http(s): ${journey.url}`);
  }

  return { ok: problems.length === 0, problems, warnings, steps: steps.length, surfaces };
}

export function renderJourneyLint({ ok, problems, warnings, steps, surfaces }, file) {
  const line = (mark, text) => `${mark} ${text}`;
  const out = [''];
  out.push(`${file}  ·  ${steps} steps  ·  ${surfaces.join(' + ') || 'no surfaces'}`);
  for (const p of problems) out.push(line('✗ ', p));
  for (const w of warnings) out.push(line('!! ', w));
  if (ok) out.push(line('ok ', `${problems.length} problems, ${warnings.length} warnings`));
  out.push('');
  return out.join('\n');
}
