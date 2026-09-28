import test from 'node:test';
import assert from 'node:assert/strict';
import { eqScore, trendBadge, consistencyPts, fieldScore, strengthLabel, ordinal, shrunkClear, wilson, confidenceBadge } from '../eq.js';

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

test('shrunkClear: pulls thin samples toward the prior', () => {
  // 4/4 with a 50% prior and k=10 → (4+5)/14 ≈ 64%
  assert.ok(Math.abs(shrunkClear(4, 4) - 64.3) < 0.1);
  // volume overwhelms the prior: (90+5)/110 ≈ 86.4%
  assert.ok(Math.abs(shrunkClear(90, 100) - 86.4) < 0.1);
  assert.ok(shrunkClear(4, 4) < shrunkClear(40, 40)); // same rate, more rounds wins
});

test('wilson: sane bounds, wider when thin', () => {
  const [lo, hi] = wilson(9, 14);
  assert.ok(lo < 64 && 64 < hi && lo >= 0 && hi <= 100);
  const [lo1, hi1] = wilson(1, 1);
  const [lo27, hi27] = wilson(20, 27);
  assert.ok((hi1 - lo1) > (hi27 - lo27)); // thin sample → wider band
  assert.deepEqual(wilson(0, 0), [0, 100]);
});

test('confidenceBadge: thin/medium/high volume bands', () => {
  assert.deepEqual(confidenceBadge(3), ['Thin', 'red']);
  assert.deepEqual(confidenceBadge(7), ['Medium', 'goldfill']);
  assert.deepEqual(confidenceBadge(27), ['High', 'green']);
});
