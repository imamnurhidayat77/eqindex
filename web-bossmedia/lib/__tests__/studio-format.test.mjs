import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtDay, isoDayNZ, isAbandoned, nzdc, payoutBreakdown, statusLabel, tierLabel } from '../studio-format.mjs';

test('nzdc shows cents only when there are cents', () => {
  assert.equal(nzdc(99100), 'NZ$991');
  assert.equal(nzdc(10580), 'NZ$105.80');
  assert.equal(nzdc(null), 'NZ$0');
});

test('fmtDay uses NZ time, so a UTC evening sale lands on the NZ day', () => {
  const now = new Date('2026-11-24T00:00:00Z');
  assert.equal(fmtDay('2026-11-17T20:30:00Z', now), '18 Nov');
  assert.equal(fmtDay('2025-03-01T00:00:00Z', now), '1 Mar 2025');
  assert.equal(fmtDay('nope', now), '—');
  assert.equal(isoDayNZ('2026-11-17T20:30:00Z'), '2026-11-18');
});

test('pending checkouts older than 24h are abandoned', () => {
  const now = Date.parse('2026-11-24T00:00:00Z');
  assert.equal(isAbandoned({ status: 'pending', created_at: '2026-11-22T00:00:00Z' }, now), true);
  assert.equal(isAbandoned({ status: 'pending', created_at: '2026-11-23T12:00:00Z' }, now), false);
  assert.equal(isAbandoned({ status: 'paid', created_at: '2026-11-01T00:00:00Z' }, now), false);
});

test('labels hide raw slugs', () => {
  assert.equal(statusLabel('awaiting_payment'), 'Awaiting payment');
  assert.equal(statusLabel('published'), 'Published');
  assert.equal(tierLabel('high-res'), 'High Res');
  assert.equal(tierLabel(''), '—');
});

test('payout breakdown always adds up to gross', () => {
  const b = payoutBreakdown({ gross_cents: 99100, fee_cents: 10580, organizer_cents: 0, payout_cents: 87736 });
  assert.equal(b.fee + b.organizer + b.cardFees + b.payout, b.gross);
  assert.equal(b.cardFees, 784);
});

test('fmtRange collapses shared month and year', async () => {
  const { fmtRange } = await import('../format.js');
  assert.equal(fmtRange('2027-03-17T00:00:00', '2027-03-20T00:00:00'), '17 – 20 Mar 2027');
  assert.equal(fmtRange('2027-03-28T00:00:00', '2027-04-02T00:00:00'), '28 Mar – 2 Apr 2027');
  assert.equal(fmtRange('2027-03-05T00:00:00', '2027-03-05T00:00:00'), '5 Mar 2027');
  assert.equal(fmtRange('', ''), '—');
});
