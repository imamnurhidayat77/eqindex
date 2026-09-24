import test from 'node:test';
import assert from 'node:assert/strict';
import { eqScore, trendBadge, consistencyPts, fieldScore, strengthLabel, ordinal } from '../eq.js';

test('eqScore: rewards clears, penalises faults, caps 0–99', () => {
  assert.equal(eqScore(100, 0, 20), 99); // 45+50-0+6=101 → capped
  assert.equal(eqScore(0, 0, 0), 45);
  assert.equal(eqScore(0, 30, 0), 0); // 45-75 → floored
  assert.ok(eqScore(70, 1.9, 10) > eqScore(60, 2.8, 5));
});

test('trendBadge: improving/declining/stable thresholds', () => {
  const clear5 = Array(5).fill({ clear_round: true });
  const mixed = [{ clear_round: true }, { clear_round: false }];
  assert.deepEqual(trendBadge(40, clear5)[0], 'Improving');
  assert.deepEqual(trendBadge(90, mixed)[0], 'Declining');
  assert.deepEqual(trendBadge(50, mixed)[0], 'Stable');
  assert.deepEqual(trendBadge(50, [])[0], 'Stable');
});

test('consistencyPts: null-safe, bounded', () => {
  assert.equal(consistencyPts(null), null);
  assert.equal(consistencyPts(undefined), null);
  assert.equal(consistencyPts(0), 100);
  assert.ok(consistencyPts(99) >= 0);
});

test('fieldScore + strengthLabel agree on bands', () => {
  const elite = fieldScore(70, 1);
  assert.ok(elite >= 75 && strengthLabel(elite) === 'Elite');
  assert.equal(strengthLabel(fieldScore(10, 12)), 'Developing');
});

test('ordinal handles 11–13 correctly', () => {
  assert.equal(ordinal(1), '1st');
  assert.equal(ordinal(11), '11th');
  assert.equal(ordinal(22), '22nd');
  assert.equal(ordinal(null), '–');
});
