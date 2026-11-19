// A self-contained HTML report. One file, no assets, no network — it goes into the
// artifact dir next to the sealed pack so the proof can be opened by someone who
// has never installed this repo.
import { DIVERGENCE, STATUS } from './diverge.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

function cell(side = {}) {
  const s = side.status;
  if (s === STATUS.PASS) return { text: 'pass', cls: 'ok' };
  if (s === STATUS.FAIL) return { text: 'FAIL', cls: 'bad' };
  if (s === STATUS.MISSING) return { text: 'absent', cls: 'muted' };
  if (s === STATUS.ERROR) return { text: 'error', cls: 'bad' };
  if (s === STATUS.SKIPPED) return { text: 'skipped', cls: 'muted' };
  return { text: '—', cls: 'muted' };
}

function label(div) {
  if (div === DIVERGENCE.AGREED_PASS) return { text: 'agree', cls: 'ok' };
  if (div === DIVERGENCE.AGREED_FAIL) return { text: 'both fail', cls: 'warn' };
  if (div === DIVERGENCE.SPLIT) return { text: 'SPLIT', cls: 'bad' };
  if (div === DIVERGENCE.UNPROVEN) return { text: 'unproven', cls: 'warn' };
  return { text: 'error', cls: 'bad' };
}

export function renderHtml(result) {
  const { rows = [], summary = {}, runs = {}, journey = {}, pack = null, artifacts = null, loopHistory = [] } = result;
  const clean = !summary.split && !summary.agreedFail && !summary.unproven && !summary.error;

  const rowHtml = rows
    .map((r) => {
      const d = cell(r.desktop);
      const s = cell(r.simulator);
      const l = label(r.divergence);
      return `<tr class="${l.cls === 'bad' ? 'split' : ''}">
      <td class="n">${r.n}</td>
      <td class="step">${esc(r.anchor)}</td>
      <td class="${d.cls}">${d.text}</td>
      <td class="${s.cls}">${s.text}</td>
      <td class="${l.cls}">${l.text}</td>
    </tr>`;
    })
    .join('\n');

  const surfaceHtml = ['desktop', 'simulator']
    .map((name) => {
      const r = runs[name] || {};
      const ok = r.ok ? 'ok' : 'bad';
      return `<li><span class="${ok}">${r.ok ? 'ran' : 'failed'}</span> <b>${name}</b>
        · exit ${r.exitCode ?? '?'} · ${r.steps?.length ?? 0} steps
        · ${Math.round((r.durationMs || 0) / 1000)}s${r.runId ? ` · run ${esc(r.runId)}` : ''}</li>`;
    })
    .join('\n');

  const findings = rows.filter((r) => r.divergence !== DIVERGENCE.AGREED_PASS && r.divergence !== DIVERGENCE.AGREED_FAIL);
  const findingHtml = findings.length
    ? `<h2>Findings</h2>${findings
        .map(
          (f) => `<article class="finding">
        <h3>${f.n}. ${esc(f.anchor)}</h3>
        <p><span class="tag ${label(f.divergence).cls}">${label(f.divergence).text}</span></p>
        <dl>
          <dt>desktop</dt><dd>${esc(f.desktop?.text || cell(f.desktop).text)}</dd>
          <dt>simulator</dt><dd>${esc(f.simulator?.text || cell(f.simulator).text)}</dd>
        </dl>
      </article>`,
        )
        .join('\n')}`
    : '<p class="muted">No findings: every step agrees on both surfaces.</p>';

  const loopHtml = loopHistory.length
    ? `<h2>Loop</h2><table class="loops"><thead><tr><th>loop</th><th>splits</th><th>agree</th><th>outcome</th></tr></thead><tbody>
       ${loopHistory
         .map((h) => `<tr><td>${h.loop}</td><td>${h.split}</td><td>${h.agreedPass}/${h.steps}</td><td class="${h.converged ? 'ok' : 'bad'}">${h.converged ? 'converged' : 'still diverged'}</td></tr>`)
         .join('\n')}
       </tbody></table>`
    : '';

  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Both Ends — ${esc(journey.id || 'journey')}</title>
<style>
  :root { --ink:#14110f; --paper:#f7f3ec; --line:#e2d9cb; --bad:#b23a12; --ok:#2f6d4f; --warn:#8a6a1f; }
  * { box-sizing: border-box; }
  body { margin:0; padding:56px 40px 96px; background:var(--paper); color:var(--ink);
         font:16px/1.55 ui-serif, Georgia, 'Times New Roman', serif; }
  .wrap { max-width: 980px; margin: 0 auto; }
  header { display:flex; justify-content:space-between; align-items:baseline; gap:24px; border-bottom:2px solid var(--ink); padding-bottom:14px; }
  h1 { font-size:30px; margin:0; letter-spacing:-0.01em; }
  .verdict { font:600 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing:.14em;
             text-transform:uppercase; padding:8px 12px; border:1px solid currentColor; border-radius:999px; }
  .verdict.ok { color:var(--ok); } .verdict.bad { color:var(--bad); }
  .sub { font:13px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; color:#6d6357; margin:18px 0 34px; }
  ul.runs { list-style:none; padding:0; margin:0 0 34px; font:13px/1.9 ui-monospace, SFMono-Regular, Menlo, monospace; }
  h2 { font-size:13px; letter-spacing:.16em; text-transform:uppercase; margin:44px 0 14px;
       font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color:#6d6357; }
  table { width:100%; border-collapse:collapse; font:13.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
  th { text-align:left; font-weight:600; color:#6d6357; border-bottom:1px solid var(--line); padding:8px 10px; }
  td { padding:9px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  td.n { width:38px; color:#8a8072; }
  td.step { font-family: ui-serif, Georgia, serif; font-size:15px; }
  tr.split { background:#f6e6df; }
  .ok { color:var(--ok); } .bad { color:var(--bad); font-weight:600; } .warn { color:var(--warn); } .muted { color:#8a8072; }
  .finding { background:#fff; border:1px solid var(--line); border-radius:14px; padding:18px 22px; margin:14px 0; }
  .finding h3 { margin:0 0 6px; font-size:17px; }
  .finding dl { display:grid; grid-template-columns:120px 1fr; gap:4px 14px; margin:6px 0 0;
                font:13px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .finding dt { color:#6d6357; } .finding dd { margin:0; }
  .tag { font:600 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing:.1em;
         text-transform:uppercase; border:1px solid currentColor; border-radius:999px; padding:5px 9px; }
  footer { margin-top:56px; border-top:1px solid var(--line); padding-top:16px;
           font:12px/1.7 ui-monospace, SFMono-Regular, Menlo, monospace; color:#8a8072; word-break:break-all; }
</style>
<div class="wrap">
  <header>
    <h1>Both Ends · ${esc(journey.title || journey.id || 'journey')}</h1>
    <span class="verdict ${clean ? 'ok' : 'bad'}">${clean ? 'converged' : 'diverged'}</span>
  </header>
  <p class="sub">${summary.agreedPass ?? 0}/${summary.steps ?? 0} steps agree on both surfaces
     · ${summary.split ?? 0} split · ${summary.unproven ?? 0} unproven · ${summary.error ?? 0} error</p>
  <ul class="runs">
    ${surfaceHtml}
  </ul>
  <h2>Aligned steps</h2>
  <table>
    <thead><tr><th>#</th><th>journey step</th><th>desktop</th><th>simulator</th><th>divergence</th></tr></thead>
    <tbody>
${rowHtml}
    </tbody>
  </table>
  <p class="sub">Compared through the journey, not by index: a browser and a simulator
     do not perform the same number of steps.</p>
  ${findingHtml}
  ${loopHtml}
  <footer>
    ${pack?.path ? `sealed pack: ${esc(pack.path)}<br>sha256: ${esc(pack.sha256 || '')}<br>` : 'no merged pack — raw events in replay/<br>'}
    ${artifacts?.dir ? `artifacts: ${esc(artifacts.dir)}` : ''}
  </footer>
</div>
</html>
`;
}
