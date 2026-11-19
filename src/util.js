// Small, dependency-free helpers shared by the CLI.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

export function sha256File(path) {
  if (!existsSync(path)) return null;
  return sha256(readFileSync(path));
}

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeText(path, text) {
  ensureDir(dirname(path));
  writeFileSync(path, text);
  return path;
}

export function readText(path, fallback = '') {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return fallback;
  }
}

export function nowIso() {
  return new Date().toISOString();
}

/** Deterministic-ish short id: time + random suffix, no deps. */
export function shortId(prefix = 'run') {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${t}-${r}`;
}

export function relPath(from, to) {
  return resolve(from, to);
}

export const isTTY = () => Boolean(process.stdout.isTTY);

export function colorize(code, text) {
  if (!isTTY() || process.env.NO_COLOR) return text;
  return `\u001b[${code}m${text}\u001b[0m`;
}

export const green = (t) => colorize('32', t);
export const red = (t) => colorize('31', t);
export const yellow = (t) => colorize('33', t);
export const dim = (t) => colorize('2', t);
export const bold = (t) => colorize('1', t);
export const cyan = (t) => colorize('36', t);

/** Pad to width, accounting for ANSI escapes. */
export function pad(text, width, align = 'left') {
  const visible = String(text).replace(/\u001b\[[0-9;]*m/g, '');
  const gap = Math.max(0, width - visible.length);
  return align === 'right' ? ' '.repeat(gap) + text : text + ' '.repeat(gap);
}

/** Render rows as a monospace table (no box drawing — copy/pastes cleanly). */
export function table(headers, rows, aligns = []) {
  const widths = headers.map((h, i) =>
    Math.max(String(h).length, ...rows.map((r) => String(r[i] ?? '').length)),
  );
  const line = (cells, sep = '  ') =>
    cells.map((c, i) => pad(String(c ?? ''), widths[i], aligns[i])).join(sep).trimEnd();
  const out = [line(headers), line(widths.map((w) => '-'.repeat(w)))];
  for (const r of rows) out.push(line(r));
  return out.join('\n');
}

export function truncate(text, max) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}
