// Unit: wallet computeSplit math (offline, no DB).
// Money rule: 10 platform / 10 organizer / 80 photographer, fractions of
// gross; platform absorbs rounding pennies (see src/lib/wallet.js).
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import wallet from './src/lib/wallet.js';

const { computeSplit } = wallet;

describe('computeSplit', () => {
  test('parts always sum back to gross (rounding absorbed by platform)', () => {
    for (const gross of [0, 1, 99, 100, 3500, 9999, 100000]) {
      const p = computeSplit(gross, 0.1, 0.1, true);
      assert.equal(p.photographerPayout + p.organizerPayout + p.platformFee, gross, `gross=${gross}`);
    }
  });
  test('standard 10/10/80 split', () => {
    assert.deepEqual(computeSplit(10000, 0.1, 0.1, true), {
      photographerPayout: 8000, organizerPayout: 1000, platformFee: 1000,
    });
  });
  test('no organizer: share stays with the platform', () => {
    const p = computeSplit(10000, 0.1, 0.1, false);
    assert.equal(p.organizerPayout, 0);
    assert.equal(p.photographerPayout, 8000);
    assert.equal(p.platformFee, 2000);
  });
  test('tiny gross never goes negative', () => {
    const p = computeSplit(1, 0.1, 0.1, true);
    assert.ok(p.platformFee >= 0 && p.photographerPayout >= 0 && p.organizerPayout >= 0);
    assert.equal(p.photographerPayout + p.organizerPayout + p.platformFee, 1);
  });
  test('zero/NaN gross → all zeros', () => {
    for (const g of [0, -50, NaN, null, undefined, '']) {
      assert.deepEqual(computeSplit(g, 0.1, 0.1, true), {
        photographerPayout: 0, organizerPayout: 0, platformFee: 0,
      }, `gross=${String(g)}`);
    }
  });
});

describe('late organizer claim', () => {
  const { lateOrganizerShare, ORGANIZER_CLAIM_DAYS } = wallet;
  test('moves the organizer share out of the platform fee', () => {
    // NZ$100 sale, no organizer: platform kept 2000, organizer share is 1000.
    assert.equal(lateOrganizerShare(10000, 2000, 0.1), 1000);
  });
  test('never moves more than the platform actually kept', () => {
    // Sponsor discount shrank the platform fee to 300.
    assert.equal(lateOrganizerShare(10000, 300, 0.1), 300);
    assert.equal(lateOrganizerShare(10000, -50, 0.1), 0);
  });
  test('zero rate or bad input moves nothing', () => {
    assert.equal(lateOrganizerShare(10000, 2000, 0), 0);
    assert.equal(lateOrganizerShare(null, 2000, 0.1), 0);
  });
  test('claim window is 90 days after the event', () => {
    assert.equal(ORGANIZER_CLAIM_DAYS, 90);
  });
});

describe('sponsor discount cap', () => {
  const { cappedSponsorDiscount } = wallet;
  test('discount never exceeds half the price', () => {
    assert.equal(cappedSponsorDiscount(1000, 5000), 1000);
    assert.equal(cappedSponsorDiscount(4999, 5000), 2500);
    assert.equal(cappedSponsorDiscount(500, 999), 499);
  });
  test('bad input gives no discount', () => {
    assert.equal(cappedSponsorDiscount(-5, 5000), 0);
    assert.equal(cappedSponsorDiscount(1000, 0), 0);
  });
});
