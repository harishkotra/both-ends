// Drive the phone surface with Appium and capture the bug, without Kane.
//
// This is the same WebDriver session Kane would open, just scripted directly:
// tap Add to cart, type HACK25, tap Apply, read the totals, screenshot.
// Use it to prove the phone really disagrees with the browser (and to grab
// frames for the demo) when no Kane credentials are in the room.
//
//   node scripts/shoot-phone.mjs [outDir]
//
// Requires: appium running on 127.0.0.1:4723 with the xcuitest driver, a booted
// simulator, and the app built at demo/build/Build/Products/Debug-iphonesimulator.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const APPIUM = process.env.APPIUM_URL || 'http://127.0.0.1:4723';
const OUT = resolve(process.argv[2] || 'docs/img');
const APP = process.env.APP_PATH || 'demo/build/Build/Products/Debug-iphonesimulator/BothEndsDemo.app';
const UDID = execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted'], { encoding: 'utf8' })
  .split('\n').find((l) => l.includes('(Booted)'))?.match(/\(([0-9A-F-]{36})\)/)?.[1];

if (!UDID) throw new Error('no booted simulator — xcrun simctl boot "iPhone 18 Pro"');

const call = async (method, path, body) => {
  const res = await fetch(APPIUM + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? (method === 'POST' ? {} : undefined)),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
  return json.value ?? json;
};

mkdirSync(OUT, { recursive: true });

const session = await call('POST', '/session', {
  capabilities: {
    alwaysMatch: {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
      'appium:udid': UDID,
      'appium:app': resolve(APP),
      'appium:noReset': false,
      'appium:newCommandTimeout': 240,
    },
  },
});
const sid = session.sessionId;

const find = (id) => call('POST', `/session/${sid}/element`, { using: 'accessibility id', value: id });
const click = async (id) => call('POST', `/session/${sid}/element/${(await find(id))['element-6066-11e4-a52e-4f735466cecf']}/click`);
const type = (id, text) => find(id).then((e) => call('POST', `/session/${sid}/element/${e['element-6066-11e4-a52e-4f735466cecf']}/value`, { text }));
const read = (id) => find(id).then((e) => call('GET', `/session/${sid}/element/${e['element-6066-11e4-a52e-4f735466cecf']}/text`));
const shot = async (name) => {
  const v = await call('GET', `/session/${sid}/screenshot`);
  const b64 = typeof v === 'string' ? v : v?.base64;
  if (!b64) throw new Error(`screenshot returned no data: ${JSON.stringify(v).slice(0, 200)}`);
  writeFileSync(join(OUT, name), Buffer.from(b64, 'base64'));
  console.log('shot', join(OUT, name));
};

try {
  await shot('phone-01-home.png');
  await click('add-bowl');
  await new Promise((r) => setTimeout(r, 500));
  await type('promo-field', 'HACK25');
  await click('apply-promo');
  await new Promise((r) => setTimeout(r, 400));
  await call('POST', `/session/${sid}/appium/device/hide_keyboard`).catch(() => {});
  await new Promise((r) => setTimeout(r, 400));
  // scroll the cart summary into view
  await call('POST', `/session/${sid}/wda/element/0/scroll`, { toVisible: false }).catch(() => {});
  await call('POST', `/session/${sid}/actions`, {
    actions: [{
      type: 'pointer', id: 'finger', parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: 200, y: 600 },
        { type: 'pointerDown', button: 0 },
        { type: 'pointerMove', duration: 500, x: 200, y: 260 },
        { type: 'pointerUp', button: 0 },
      ],
    }],
  }).catch(() => {});
  await new Promise((r) => setTimeout(r, 700));
  await shot('phone-02-cart-bug.png');

  const out = {};
  for (const id of ['subtotal', 'discount', 'total']) {
    try {
      const el = await find(id);
      out[id] = await call('GET', `/session/${sid}/element/${el['element-6066-11e4-a52e-4f735466cecf']}/attribute/value`);
    } catch { out[id] = null; }
  }
  console.log(JSON.stringify(out, null, 2));
  writeFileSync(join(OUT, 'phone-totals.json'), JSON.stringify(out, null, 2) + '\n');
} finally {
  await call('DELETE', `/session/${sid}`).catch(() => {});
}
