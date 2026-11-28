import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderMatches, reelMatch, suggestedReels } from '../reel-match.mjs';
import { waitedFor, daysSince } from '../studio-format.mjs';

const order = { event_id: 'e1', horse_name: '  BMW  Sharpshooter ' };

test('reelMatch compares event id and horse name loosely', () => {
  assert.equal(reelMatch({ event_id: 'e1', horse: 'bmw sharpshooter' }, order), 'both');
  assert.equal(reelMatch({ event_id: 'e1', horse: 'Other' }, order), 'event');
  assert.equal(reelMatch({ event_id: null, horse: 'BMW Sharpshooter' }, order), 'horse');
  assert.equal(reelMatch({ event_id: null, horse: null }, order), null);
  assert.equal(reelMatch({ event_id: null, horse: '' }, { event_id: null, horse_name: '' }), null);
});

test('suggestedReels drops non matches and duplicates, best match first', () => {
  const reels = [
    { id: 'a', event_id: 'e1', horse: 'x', created_at: '2026-11-02' },
    { id: 'b', event_id: 'e9', horse: 'BMW Sharpshooter', created_at: '2026-11-01' },
    { id: 'c', event_id: 'e1', horse: 'BMW Sharpshooter', created_at: '2026-10-01' },
    { id: 'd', event_id: 'e9', horse: 'y', created_at: '2026-11-05' },
    { id: 'a', event_id: 'e1', horse: 'x', created_at: '2026-11-02' },
  ];
  assert.deepEqual(suggestedReels(reels, order).map((r) => [r.id, r.match]), [['c', 'both'], ['b', 'horse'], ['a', 'event']]);
});

test('waitedFor gives a short age', () => {
  const now = Date.parse('2026-11-28T12:00:00Z');
  assert.equal(waitedFor('2026-11-28T11:59:50Z', now), '1 min');
  assert.equal(waitedFor('2026-11-28T07:00:00Z', now), '5 h');
  assert.equal(waitedFor('2026-11-25T11:00:00Z', now), '3 d');
  assert.equal(waitedFor(null, now), '—');
  assert.equal(Math.round(daysSince('2026-11-25T12:00:00Z', now)), 3);
});

test('orderMatches finds an order by any field, all words required', () => {
  const o = { product_name: 'Event edit', buyer_email: 'media@eqindex.app', horse_name: 'BMW Sharpshooter', event_name: 'Hawkes Bay A&P', back_number: 42 };
  assert.equal(orderMatches(o, ''), true);
  assert.equal(orderMatches(o, '  sharpSHOOTER '), true);
  assert.equal(orderMatches(o, 'hawkes edit'), true);
  assert.equal(orderMatches(o, '42'), true);
  assert.equal(orderMatches(o, 'hawkes raw'), false);
});
