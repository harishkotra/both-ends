// Drive the desktop surface in a real Chrome and capture what it shows.
//
// Zero dependencies: Chrome's DevTools Protocol over Node's built-in WebSocket.
// Used for demo frames, and as a second oracle next to `kane-cli run` — if the
// browser says 18.75 and the phone says 24.94, that is a divergence, whether a
// human or Kane noticed it first.
//
//   node scripts/shoot-web.mjs [outDir]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const CHROME = process.env.CHROME_BIN ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = resolve(process.argv[2] || 'docs/img');
const URL_ = process.env.DEMO_URL || 'http://127.0.0.1:4173';
const PORT = 9333;

mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--window-size=1280,1100',
  '--hide-scrollbars',
  '--no-first-run',
  '--user-data-dir=/tmp/both-ends-chrome',
  'about:blank',
], { stdio: 'ignore' });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function targetWs() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* chrome still starting */ }
    await wait(250);
  }
  throw new Error('chrome devtools did not come up');
}

const ws = new WebSocket(await targetWs());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});

function cdp(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => {
    pending.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
  });
}

const evaluate = async (expression) =>
  (await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;

await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1100, deviceScaleFactor: 2, mobile: false });
await cdp('Page.navigate', { url: URL_ });
await wait(1200);

await evaluate("document.getElementById('accept-cookies').click()");
await evaluate("document.querySelector('.dish[data-id=\"bowl\"] .add, .dish[data-id=\"bowl\"] button').click()");
await wait(300);
await evaluate("document.getElementById('promo').value = 'HACK25'; document.getElementById('apply').click();");
await wait(500);
await evaluate("document.getElementById('open-cart').click()");
await wait(400);

const totals = await evaluate(`(() => ({
  subtotal: document.getElementById('subtotal').textContent.trim(),
  discount: document.getElementById('discount-row').hidden ? null : document.getElementById('discount').textContent.trim(),
  total: document.getElementById('total').textContent.trim(),
  count: document.getElementById('cart-count').textContent.trim(),
}))()`);

const { data } = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
writeFileSync(join(OUT, 'web-cart-ok.png'), Buffer.from(data, 'base64'));
console.log('shot', join(OUT, 'web-cart-ok.png'));
console.log(JSON.stringify(totals, null, 2));
writeFileSync(join(OUT, 'web-totals.json'), JSON.stringify(totals, null, 2) + '\n');

ws.close();
chrome.kill();
