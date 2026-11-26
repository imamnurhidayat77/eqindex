import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { COURIERS, ORDER_STEPS, TRACKING_RE, orderComplete, orderStatusLabel, orderStepIndex, orderSteps, shipmentInfo } from '../merch-order-status.mjs';

const MIGRATION = new URL('../../../db/migrations/108_merch_orders.sql', import.meta.url);
test('every db status has a buyer label', { skip: !existsSync(MIGRATION) && 'db folder not next to web-bossmedia' }, () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  const list = sql.match(/status IN \(([^)]+)\)/)[1].match(/'([a-z_]+)'/g).map((x) => x.slice(1, -1));
  assert.ok(list.length >= 10);
  for (const st of list) assert.notEqual(orderStatusLabel(st), 'Unknown status', st);
});

test('steps progress in order and end states are off the track', () => {
  assert.equal(orderStepIndex('submitted'), 0);
  assert.equal(orderStepIndex('changes_requested'), 0);
  assert.equal(orderStepIndex('paid'), 3);
  assert.equal(orderStepIndex('shipped'), ORDER_STEPS.length - 2);
  assert.equal(orderStepIndex('delivered'), ORDER_STEPS.length - 1);
  assert.ok(orderComplete('delivered') && !orderComplete('shipped'));
  assert.equal(orderStepIndex('cancelled'), -1);
});

test('club pickup orders read as collected, not shipped', () => {
  assert.equal(orderStatusLabel('shipped', 'pickup'), 'Ready to collect at your club');
  assert.equal(orderStatusLabel('shipped', 'courier'), 'Shipped');
  assert.equal(orderStatusLabel('paid', 'pickup'), orderStatusLabel('paid'));
});


test('pickup tracker says ready to collect and collected', () => {
  const labels = orderSteps('pickup').map((st) => st.label);
  assert.deepEqual(labels.slice(-2), ['Ready to collect', 'Collected']);
  assert.deepEqual(orderSteps('courier').slice(-2).map((st) => st.label), ['On its way', 'Delivered']);
});

test('shipment info: courier name, tracking number and a safe tracking link', () => {
  const nz = shipmentInfo({ carrier: 'nzpost', tracking: 'AB 1234 5678 NZ' });
  assert.equal(nz.courier, 'NZ Post');
  assert.equal(nz.url, 'https://www.nzpost.co.nz/tools/tracking?trackid=AB12345678NZ');
  assert.ok(nz.codeInLink);
  const mf = shipmentInfo({ carrier: 'mainfreight', tracking: 'X123' });
  assert.equal(mf.url, 'https://www.mainfreight.com/en-nz/tracking');
  assert.ok(!mf.codeInLink, 'the buyer pastes the code there');
  assert.deepEqual(shipmentInfo({ carrier: 'other', carrierName: 'Local van', tracking: 'R-77' }), { courier: 'Local van', tracking: 'R-77', url: null, codeInLink: false });
  assert.equal(shipmentInfo({ carrier: 'nzpost' }).url, null, 'no number, no link');
  assert.equal(shipmentInfo({ carrier: 'nope' }), null);
  assert.ok(TRACKING_RE.test('AB 1234-5678') && !TRACKING_RE.test('<script>') && !TRACKING_RE.test('ab'));
  for (const c of COURIERS) assert.ok(!c.track || c.track.startsWith('https://'), c.id);
});
