import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ORDER_STEPS, orderStatusLabel, orderStepIndex } from '../merch-order-status.mjs';

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
  assert.equal(orderStepIndex('delivered'), ORDER_STEPS.length - 1);
  assert.equal(orderStepIndex('cancelled'), -1);
});
