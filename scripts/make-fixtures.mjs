// Regenerates the recorded fixtures used by tests and by `--fake` demos.
// These are the shape both-ends normalizes from kane-cli `--agent` NDJSON:
// one JSON object per line, no terminal escape codes.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DESKTOP = [
  { type: 'start', run_id: 'fx-web', target: 'desktop', url: 'http://127.0.0.1:4173' },
  { type: 'step', text: 'Opened http://127.0.0.1:4173 in Chrome and dismissed the cookie banner', status: 'pass' },
  { type: 'step', text: 'Clicked Add to cart on the Signature Bowl', status: 'pass' },
  { type: 'step', text: 'Opened the cart: the cart badge shows 1 item', status: 'pass' },
  { type: 'step', text: 'Typed HACK25 into the promo field and clicked Apply: the promo code HACK25 is shown as applied', status: 'pass' },
  { type: 'observation', text: 'Read the totals: the subtotal shows 25.00', status: 'pass' },
  { type: 'observation', text: 'Read the totals: the cart shows a discount of 6.25', status: 'pass' },
  { type: 'observation', text: 'Read the totals: the order total shows 18.75', status: 'pass' },
  { type: 'step', text: 'Clicked Place order: the confirmation shows an order number starting with BE-', status: 'pass' },
  { type: 'run_end', status: 'passed', run_id: 'fx-web', final_validation: 'pass' },
];

const SIM_BUGGY = [
  { type: 'start', run_id: 'fx-sim', target: 'simulator', app: 'BothEndsDemo.app' },
  { type: 'step', text: 'Launched Both Ends Demo on iPhone 17 Pro and allowed notifications', status: 'pass' },
  { type: 'step', text: 'Tapped Add to cart on the Signature Bowl', status: 'pass' },
  { type: 'step', text: 'Opened the cart: the cart badge shows 1 item', status: 'pass' },
  { type: 'step', text: 'Typed HACK25 into the promo field and tapped Apply: the promo code HACK25 is shown as applied', status: 'pass' },
  { type: 'observation', text: 'Read the totals: the subtotal shows 25.00', status: 'pass' },
  { type: 'observation', text: 'Read the totals: no discount line is shown in the cart', status: 'fail', detail: 'expected a discount line of 6.25' },
  { type: 'observation', text: 'Read the totals: the order total shows 25.00', status: 'fail', detail: 'expected 18.75' },
  { type: 'step', text: 'Tapped Place order: the confirmation shows an order number starting with BE-', status: 'pass' },
  { type: 'run_end', status: 'failed', run_id: 'fx-sim', final_validation: 'fail' },
];

const SIM_FIXED = SIM_BUGGY.map((e) => {
  if (/no discount line/.test(e.text || '')) return { ...e, text: 'Read the totals: the cart shows a discount of 6.25', status: 'pass', detail: undefined };
  if (/order total shows 25.00/.test(e.text || '')) return { ...e, text: 'Read the totals: the order total shows 18.75', status: 'pass', detail: undefined };
  if (e.type === 'run_end') return { ...e, status: 'passed', final_validation: 'pass' };
  return e;
});

function write(dir, name, events) {
  mkdirSync(dir, { recursive: true });
  const body = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
  writeFileSync(join(dir, name), body);
}

write('fixtures/demo/loop-1', 'desktop.ndjson', DESKTOP);
write('fixtures/demo/loop-1', 'simulator.ndjson', SIM_BUGGY);
write('fixtures/demo/loop-2', 'desktop.ndjson', DESKTOP);
write('fixtures/demo/loop-2', 'simulator.ndjson', SIM_FIXED);

console.log('fixtures written');
