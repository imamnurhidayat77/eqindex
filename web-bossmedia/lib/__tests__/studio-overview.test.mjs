import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastDays, periodTotals, withShare, saleKind } from '../studio-overview.mjs';

const NOW = Date.parse('2026-11-28T00:00:00Z'); // 1 PM 28 Nov in NZ

test('lastDays fills gaps and ends today in NZ time', () => {
  const days = lastDays([{ day: '2026-11-27', gross_cents: '1500', sales: '2' }], 3, NOW);
  assert.deepEqual(days.map((d) => d.day), ['2026-11-26', '2026-11-27', '2026-11-28']);
  assert.deepEqual(days.map((d) => d.value), [0, 1500, 0]);
  assert.equal(days[1].sales, 2);
});

test('periodTotals sums and finds the best day, none when empty', () => {
  const t = periodTotals([{ day: 'a', value: 100, sales: 1 }, { day: 'b', value: 300, sales: 2 }]);
  assert.equal(t.value, 400); assert.equal(t.sales, 3); assert.equal(t.best.day, 'b');
  assert.equal(periodTotals([{ day: 'a', value: 0, sales: 0 }]).best, null);
});

test('withShare gives whole percents and handles zero total', () => {
  assert.deepEqual(withShare([{ value: 3 }, { value: 1 }]).map((r) => r.share), [75, 25]);
  assert.deepEqual(withShare([{ value: 0 }]).map((r) => r.share), [0]);
});

test('saleKind names known kinds', () => {
  assert.equal(saleKind('package'), 'Bundle');
  assert.equal(saleKind('weird'), 'Sale');
});
