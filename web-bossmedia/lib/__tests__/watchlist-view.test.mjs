import test from 'node:test';
import assert from 'node:assert/strict';
import { sortSections, countNew, cardCaption, readSeen, writeSeen, SEEN_STORAGE_KEY } from '../watchlist-view.mjs';

test('sortSections puts the newest photo first, empty sections last in original order', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const shots = {
    a: [{ created_at: '2026-01-01T00:00:00Z' }],
    b: [],
    c: [{ created_at: '2026-03-01T00:00:00Z' }, { created_at: '2025-01-01T00:00:00Z' }],
  };
  assert.deepEqual(sortSections(rows, shots).map((w) => w.id), ['c', 'a', 'b', 'd']);
});

test('countNew counts photos after the last visit, and none on a first visit', () => {
  const photos = [{ created_at: '2026-03-02T00:00:00Z' }, { created_at: '2026-02-01T00:00:00Z' }, { created_at: 'bad' }];
  assert.equal(countNew(photos, Date.parse('2026-03-01T00:00:00Z')), 1);
  assert.equal(countNew(photos, undefined), 0);
});

test('cardCaption prefers Rider × Horse, then event name', () => {
  assert.equal(cardCaption({ rider: 'Ann', horse: 'Bo', event_name: 'Show' }), 'Ann × Bo');
  assert.equal(cardCaption({ horse: 'Bo' }), 'Bo');
  assert.equal(cardCaption({ event_name: 'Show' }), 'Show');
  assert.equal(cardCaption({}), 'Untitled');
});

test('seen store round-trips and survives broken or throwing storage', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  writeSeen(storage, ['a', 'b'], 42);
  assert.deepEqual(readSeen(storage), { a: 42, b: 42 });
  mem.set(SEEN_STORAGE_KEY, '{not json');
  assert.deepEqual(readSeen(storage), {});
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(readSeen(throwing), {});
  assert.doesNotThrow(() => writeSeen(throwing, ['a'], 1));
  assert.deepEqual(readSeen(undefined), {});
});
