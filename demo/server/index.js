// The desktop surface: a small ordering console with one job — make the total
// visible and unambiguous, so a browser agent and a phone agent end at the same
// number. No dependencies, no build step; `npm run demo` and it is up.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';

const HERE = resolve(import.meta.dirname);
const WEB = join(HERE, '..', 'web');
const PORT = Number(process.env.PORT || 4173);

const MENU = {
  items: [
    { id: 'bowl', name: 'Signature Bowl', price: 25.0, note: 'miso greens, crisp rice' },
    { id: 'tea', name: 'Yuzu Iced Tea', price: 5.0, note: 'no added sugar' },
  ],
  promo: { code: 'HACK25', label: 'HACK25 · 25% off', percent: 25 },
};

const orders = new Map();
let orderSeq = 0;

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

function json(res, code, body) {
  const payload = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(payload);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

  if (url.pathname === '/api/menu') return json(res, 200, MENU);

  if (url.pathname === '/api/orders' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let parsed = {};
    try { parsed = body ? JSON.parse(body) : {}; } catch { return json(res, 400, { error: 'bad json' }); }
    const subtotal = Number(parsed.subtotal ?? 0);
    const discount = Number(parsed.discount ?? 0);
    orderSeq += 1;
    const id = `BE-${String(1042 + orderSeq)}`;
    const order = { id, subtotal, discount, total: Number((subtotal - discount).toFixed(2)), promo: parsed.promo ?? null, placedAt: new Date().toISOString() };
    orders.set(id, order);
    return json(res, 201, order);
  }

  const match = url.pathname.match(/^\/api\/orders\/([A-Za-z0-9-]+)$/);
  if (match) {
    const order = orders.get(match[1]);
    return order ? json(res, 200, order) : json(res, 404, { error: 'no such order' });
  }

  // static
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '');
  const file = join(WEB, rel);
  if (!file.startsWith(WEB) || !existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('not found');
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(readFileSync(file));
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`both-ends demo console → http://127.0.0.1:${PORT}\n`);
});
