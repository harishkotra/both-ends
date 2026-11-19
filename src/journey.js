// Journey files: one plain-English flow, written once, executed on every surface.
//
//   ---
//   id: place-order
//   surfaces: desktop, simulator
//   url: http://127.0.0.1:4173
//   app: demo/build/BothEndsDemo.app
//   device: iPhone 17 Pro
//   ---
//   ## Objective
//   ### desktop
//   open the storefront and place an order…
//   ### simulator
//   launch the app and place an order…
//   ## Steps
//   1. anchor: cart holds one item
//      desktop: the cart shows 1 item
//      simulator: the cart shows 1 item
import { readText } from './util.js';
import { resolve, dirname } from 'node:path';

const SURFACE_ALIASES = new Map([
  ['desktop', 'desktop'],
  ['web', 'desktop'],
  ['chrome', 'desktop'],
  ['browser', 'desktop'],
  ['simulator', 'simulator'],
  ['ios', 'simulator'],
  ['mobile', 'simulator'],
  ['phone', 'simulator'],
]);

export const SURFACES = ['desktop', 'simulator'];

export function canonSurface(name) {
  const key = String(name).trim().toLowerCase();
  const canon = SURFACE_ALIASES.get(key);
  if (!canon) {
    throw new Error(`unknown surface "${name}" — use desktop|web or simulator|mobile|ios`);
  }
  return canon;
}

function parseScalar(raw) {
  const v = String(raw).trim();
  if (v === '') return '';
  if (v.startsWith('[') && v.endsWith(']')) {
    return v
      .slice(1, -1)
      .split(',')
      .map((s) => s.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v.replace(/^["']|["']$/g, '');
}

function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return { meta: {}, body: text };
  const end = lines.indexOf('---', 1);
  if (end === -1) throw new Error('frontmatter opened with --- but never closed');
  const meta = {};
  for (const line of lines.slice(1, end)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = line.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    meta[m[1]] = parseScalar(m[2]);
  }
  return { meta, body: lines.slice(end + 1).join('\n') };
}

function splitSections(body) {
  const out = [];
  let current = { name: '', lines: [] };
  for (const line of body.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      if (current.name || current.lines.some((l) => l.trim())) out.push(current);
      current = { name: h[1].toLowerCase(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.name || current.lines.some((l) => l.trim())) out.push(current);
  return out;
}

function parseObjective(lines) {
  const objective = {};
  let current = null;
  for (const line of lines) {
    const h = line.match(/^###\s+(.+?)\s*$/);
    if (h) {
      current = canonSurface(h[1]);
      objective[current] = '';
      continue;
    }
    if (current) objective[current] += (objective[current] ? '\n' : '') + line;
  }
  for (const k of Object.keys(objective)) {
    objective[k] = objective[k].replace(/^\s+|\s+$/g, '');
  }
  return objective;
}

function parseSteps(lines) {
  const steps = [];
  let current = null;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const start = raw.match(/^\s*(\d+)[.)]\s*(.*)$/);
    if (start) {
      if (current) steps.push(current);
      const body = start[2].replace(/^anchor\s*:\s*/i, '').trim();
      current = { n: Number(start[1]), anchor: body, perSurface: {}, expect: 'pass' };
      continue;
    }
    if (!current) continue;
    const kv = raw.match(/^\s{2,}([A-Za-z]+)\s*:\s*(.*)$/);
    if (kv) {
      const key = kv[1].toLowerCase();
      const value = kv[2].trim();
      if (key === 'anchor') current.anchor = value;
      else if (key === 'expect') current.expect = value;
      else if (key === 'desktop' || key === 'simulator' || key === 'web' || key === 'mobile' || key === 'ios') {
        current.perSurface[canonSurface(key)] = value;
      }
    }
  }
  if (current) steps.push(current);
  return steps.filter((s) => s.anchor);
}

/**
 * Parse a journey file into a normalized spec.
 * @param {string} file absolute or relative path
 */
export function loadJourney(file) {
  const path = resolve(file);
  const text = readText(path);
  if (!text) throw new Error(`journey not found or empty: ${path}`);
  const { meta, body } = parseFrontmatter(text);
  const sections = splitSections(body);

  const objectiveSection = sections.find((s) => s.name.includes('objective'));
  const stepSection = sections.find((s) => s.name.includes('step'));
  const whySection = sections.find((s) => s.name.includes('why'));

  if (!objectiveSection) throw new Error(`${file}: missing "## Objective" section`);
  if (!stepSection) throw new Error(`${file}: missing "## Steps" section — the divergences are only findable if the steps are named`);

  const objective = parseObjective(objectiveSection.lines);
  const steps = parseSteps(stepSection.lines);

  const declared = Array.isArray(meta.surfaces)
    ? meta.surfaces.map(canonSurface)
    : String(meta.surfaces ?? 'desktop, simulator')
        .split(',')
        .map(canonSurface)
        .filter(Boolean);

  for (const surface of declared) {
    if (!objective[surface]) {
      throw new Error(`${file}: surface "${surface}" is declared but has no "### ${surface}" objective`);
    }
  }
  if (steps.length === 0) throw new Error(`${file}: "## Steps" has no numbered steps`);

  for (const step of steps) {
    const absent = declared.filter((s) => !step.perSurface[s] && !step.perSurface[s === 'desktop' ? 'simulator' : 'desktop']);
    for (const s of declared) {
      if (!step.perSurface[s]) {
        // A step may be declared only once; both-ends then compares against the
        // same expectation on the other surface instead of guessing.
        step.perSurface[s] = step.anchor;
      }
    }
    step.shared = step.perSurface.desktop === step.perSurface.simulator;
    if (step.expect !== 'pass' && step.expect !== 'fail') {
      throw new Error(`${file}: step ${step.n} has expect "${step.expect}" — use pass|fail`);
    }
  }

  return {
    path,
    dir: dirname(path),
    id: meta.id || path.split('/').pop().replace(/\.(journey\.)?md$/, ''),
    title: meta.title || meta.id || 'journey',
    surfaces: declared,
    url: meta.url || '',
    app: meta.app || '',
    device: meta.device || '',
    appium: meta.appium || '',
    osVersion: String(meta.osVersion ?? meta['os-version'] ?? ''),
    timeout: Number(meta.timeout || 240),
    maxSteps: Number(meta.maxSteps || 45),
    policy: meta.policy || '',
    why: (whySection?.lines || []).join('\n').trim(),
    objective,
    steps,
  };
}
