// Wallet split math (docs/WALLET_PLAN.md §4.1).
// Run: node --test src/lib/wallet.test.mjs  (no DB, no network)
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSplit } from './wallet.js';

test('10/10/80 of gross with organizer', () => {
  assert.deepEqual(computeSplit(10000, 0.10, 0.10, true),
    { photographerPayout: 8000, organizerPayout: 1000, platformFee: 1000 });
});

test('no organizer: platform keeps the organizer share', () => {
  assert.deepEqual(computeSplit(10000, 0.10, 0.10, false),
    { photographerPayout: 8000, organizerPayout: 0, platformFee: 2000 });
});

test('platform absorbs rounding pennies, never negative', () => {
  for (const gross of [1, 3, 99, 101, 999, 12900]) {
    const s = computeSplit(gross, 0.10, 0.10, true);
    assert.equal(s.photographerPayout + s.organizerPayout + s.platformFee, gross);
    assert.ok(s.photographerPayout >= 0 && s.organizerPayout >= 0 && s.platformFee >= 0);
  }
});

test('zero gross and junk input stay safe', () => {
  assert.deepEqual(computeSplit(0, 0.10, 0.10, true),
    { photographerPayout: 0, organizerPayout: 0, platformFee: 0 });
  assert.deepEqual(computeSplit('abc', 0.10, 0.10, false),
    { photographerPayout: 0, organizerPayout: 0, platformFee: 0 });
});
