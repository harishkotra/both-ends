#!/usr/bin/env node
// both-ends — one journey, two surfaces, one proof.
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { runBothEnds } from '../src/run.js';
import { runLoop } from '../src/loop.js';
import { renderTerminal, renderMarkdown } from '../src/report.js';
import { loadJourney } from '../src/journey.js';
import { lintPolicy, writeArtifacts } from '../src/evidence.js';
import { buildBrief } from '../src/brief.js';
import { kaneVersion, KANE_BIN } from '../src/kane.js';
import { writeText, ensureDir, shortId, green, red, yellow, dim, bold } from '../src/util.js';

const HELP = `
both-ends — prove one journey on both surfaces, or find out where they disagree.

  both-ends run  <journey.md>     run every surface, align, diff, seal a pack
  both-ends loop <journey.md>     run → brief → agent fixes → rerun, until converged
  both-ends doctor               check this machine (kane-cli, Xcode, simulator)
  both-ends lint <policy.yaml>   validate an evidence verdict policy
  both-ends serve <pack>         open a sealed pack in kane-cli's viewer

Options
  --url <url>            override the journey's start URL
  --fake <dir>           replay recorded NDJSON instead of driving a browser/phone
  --out <dir>            where artifacts go (default: .both-ends/)
  --json                 machine-readable result on stdout
  --verbose              stream kane-cli events while they happen
  --max-loops <n>        loop only (default 3)
  --fix <command>        loop only: shell command that receives brief.md
  --rebuild <command>    loop only: run before each rerun (e.g. xcodebuild)
  --no-merge             skip kane-cli evidence merge (fixture runs)

Exit codes: 0 converged · 1 diverged · 2 error
`;

function parseArgv(argv) {
  const out = { _: [], fakeDirs: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const take = () => argv[++i];
    switch (a) {
      case '--url': out.url = take(); break;
      case '--fake': out.fakeDirs.push(take()); break;
      case '--out': out.out = take(); break;
      case '--json': out.json = true; break;
      case '--verbose': out.verbose = true; break;
      case '--max-loops': out.maxLoops = Number(take()); break;
      case '--fix': out.fix = take(); break;
      case '--rebuild': out.rebuild = take(); break;
      case '--no-merge': out.noMerge = true; break;
      case '-h': case '--help': out.help = true; break;
      default:
        if (a.startsWith('--')) throw new Error(`unknown option: ${a}`);
        out._.push(a);
    }
  }
  return out;
}

async function cmdRun(args) {
  const journeyPath = args._[0];
  if (!journeyPath) throw new Error('usage: both-ends run <journey.md>');
  const result = await runBothEnds({
    journeyPath,
    workdir: process.cwd(),
    fakeDir: args.fakeDirs[0] || null,
    outDir: args.out || join(process.cwd(), '.both-ends'),
    verbose: Boolean(args.verbose),
    skipMerge: Boolean(args.noMerge || args.fakeDirs.length),
    log: (m) => process.stderr.write(`${m}\n`),
  });

  const brief = buildBrief({
    journey: result.journey,
    divergence: result.divergence,
    artifactDir: result.artifacts.dir,
    rerunCommand: `npx both-ends loop ${journeyPath}`,
  });
  writeText(join(result.artifacts.dir, 'brief.md'), brief.markdown);
  writeText(join(result.artifacts.dir, 'brief.json'), JSON.stringify(brief.json, null, 2));

  const md = renderMarkdown(result);
  writeArtifacts(result.artifacts.dir, {
    divergence: { ...result.divergence, journey: result.journey.id, runId: result.runId },
    report: md,
    runs: result.runs,
    merged: result.merged,
    policyPath: existsSync(resolve(dirname(journeyPath), '..', 'policies', 'both-ends.yaml'))
      ? resolve(dirname(journeyPath), '..', 'policies', 'both-ends.yaml')
      : null,
  });

  if (args.json) {
    process.stdout.write(
      JSON.stringify(
        {
          runId: result.runId,
          journey: result.journey.id,
          converged: result.divergence.converged,
          summary: result.divergence.summary,
          rows: result.divergence.rows,
          runs: Object.fromEntries(
            Object.entries(result.runs).map(([k, r]) => [
              k,
              { ok: r.ok, exitCode: r.exitCode, steps: r.steps?.length ?? 0, runId: r.runId, packPath: r.packPath },
            ]),
          ),
          pack: result.merged,
          artifacts: result.artifacts.dir,
          source: result.fake ? 'fixture' : 'kane',
        },
        null,
        2,
      ) + '\n',
    );
  } else {
    process.stdout.write(renderTerminal(result));
  }

  return result.divergence.converged ? 0 : 1;
}

async function cmdLoop(args) {
  const journeyPath = args._[0];
  if (!journeyPath) throw new Error('usage: both-ends loop <journey.md>');
  const result = await runLoop({
    journeyPath,
    workdir: process.cwd(),
    fakeDirs: args.fakeDirs.length ? args.fakeDirs : null,
    maxLoops: args.maxLoops || 3,
    fixCommand: args.fix || null,
    rebuildCommand: args.rebuild || null,
    outDir: args.out || join(process.cwd(), '.both-ends'),
    verbose: Boolean(args.verbose),
    log: args.json ? () => {} : (m) => process.stdout.write(`${m}\n`),
  });

  if (args.json) {
    process.stdout.write(
      JSON.stringify(
        {
          converged: result.converged,
          loops: result.loops,
          history: result.loopHistory,
          summary: result.divergence.summary,
          artifacts: result.artifacts.dir,
        },
        null,
        2,
      ) + '\n',
    );
  }
  return result.converged ? 0 : 1;
}

async function cmdDoctor() {
  const lines = [];
  const kane = await kaneVersion();
  lines.push(`${kane ? green('ok ') : red('no ')} kane-cli ${kane || `not found (${KANE_BIN()})`}`);
  lines.push(`${process.version ? green('ok ') : ''} node ${process.version}`);

  const sim = await probe(['xcrun', 'simctl', 'list', 'runtimes']);
  lines.push(`${sim.code === 0 && /iOS/.test(sim.out) ? green('ok ') : yellow('!! ')} iOS simulator runtime ${sim.code === 0 && /iOS/.test(sim.out) ? 'installed' : 'missing — run: xcodebuild -downloadPlatform iOS'}`);

  const dev = await probe(['xcrun', 'simctl', 'list', 'devices', 'available']);
  const deviceCount = (dev.out.match(/iPhone|iPad/g) || []).length;
  lines.push(`${deviceCount > 0 ? green('ok ') : yellow('!! ')} simulator devices ${deviceCount > 0 ? `${deviceCount} available` : 'none — create one in Xcode'}`);

  const xcode = await probe(['xcodebuild', '-version']);
  lines.push(`${xcode.code === 0 ? green('ok ') : yellow('!! ')} ${xcode.out.split('\n')[0] || 'xcodebuild not found'}`);

  const login = await probe([KANE_BIN(), 'whoami']);
  const loggedIn = !/Not logged in/i.test(login.out);
  lines.push(`${loggedIn ? green('ok ') : yellow('!! ')} kane-cli login ${loggedIn ? 'active' : 'not logged in — run: kane-cli login'}`);

  const appiumUrl = process.env.KANE_APPIUM_URL || 'http://127.0.0.1:4723';
  const appium = await probe(['curl', '-sf', '-m', '2', `${appiumUrl}/status`]);
  const appiumUp = appium.code === 0 && /ready|sessionId|build/i.test(appium.out);
  lines.push(`${appiumUp ? green('ok ') : yellow('!! ')} appium ${appiumUp ? `reachable at ${appiumUrl}` : `not at ${appiumUrl} — needed for the phone surface on darwin-arm64 (no managed bundle in kane-cli): appium &`}`);

  process.stdout.write('\n' + lines.join('\n') + '\n\n');
  return loggedIn ? 0 : 1;
}

function probe(cmd) {
  return new Promise((res) => {
    let out = '';
    const c = spawn(cmd[0], cmd.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] });
    c.stdout.on('data', (d) => (out += d));
    c.stderr.on('data', (d) => (out += d));
    c.on('error', () => res({ code: 127, out }));
    c.on('close', (code) => res({ code: code ?? 1, out }));
  });
}

async function cmdLint(args) {
  const policy = args._[0];
  if (!policy) throw new Error('usage: both-ends lint <policy.yaml>');
  const r = await lintPolicy(policy, process.cwd());
  process.stdout.write(`${r.output}\n`);
  return r.ok ? 0 : 1;
}

async function cmdServe(args) {
  const pack = args._[0];
  if (!pack) throw new Error('usage: both-ends serve <pack>');
  const child = spawn(KANE_BIN(), ['evidence', 'serve', resolve(pack)], { stdio: 'inherit' });
  return new Promise((res) => child.on('close', (c) => res(c ?? 0)));
}

async function cmdScaffold(args) {
  const name = args._[0] || 'journey';
  const dir = join(process.cwd(), 'journeys');
  ensureDir(dir);
  const file = join(dir, `${name}.journey.md`);
  if (existsSync(file)) throw new Error(`${file} already exists`);
  writeText(
    file,
    `---
id: ${name}
title: ${name.replace(/-/g, ' ')}
surfaces: desktop, simulator
url: http://127.0.0.1:4173
app: build/MyApp.app
device: iPhone 18 Pro
timeout: 240
maxSteps: 45
---

## Why this journey exists

One line on the user-visible promise this journey has to keep on every surface.

## Objective

### desktop

Open {{url}} and …

### simulator

Launch the app and …

## Steps

1. anchor: a short name for the step both surfaces must reach
   desktop: what should be visible on the web
   simulator: what should be visible in the app
`,
  );
  process.stdout.write(`wrote ${file}\n`);
  return 0;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgv(rest);
  if (!command || command === 'help' || args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  switch (command) {
    case 'run': return cmdRun(args);
    case 'loop': return cmdLoop(args);
    case 'doctor': return cmdDoctor();
    case 'lint': return cmdLint(args);
    case 'serve': return cmdServe(args);
    case 'new': return cmdScaffold(args);
    default:
      process.stdout.write(`unknown command: ${command}\n${HELP}`);
      return 2;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`${red('both-ends:')} ${err.message}\n`);
    if (process.env.DEBUG) process.stderr.write(`${err.stack}\n`);
    process.exit(2);
  });
