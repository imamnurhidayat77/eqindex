// Unit: import batch helpers — batch ids, similar-name picking, the name
// gate cell check, undo removal plan and fill reverts (no DB).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  isBatchId, mergeCreated, pickSimilar, SIMILAR_MIN, isUngroundedCell, planRemoval, revertableFills,
} = require('./src/lib/importBatch.js');

test('isBatchId accepts UUIDs only', () => {
  assert.equal(isBatchId('3f2b8c1e-9d4a-4b6f-8e2a-1c3d5e7f9a0b'), true);
  assert.equal(isBatchId('3F2B8C1E-9D4A-4B6F-8E2A-1C3D5E7F9A0B'), true);
  for (const bad of ['', 'abc', '3f2b8c1e9d4a4b6f8e2a1c3d5e7f9a0b', "1' OR '1'='1", null, 42, {}]) {
    assert.equal(isBatchId(bad), false, String(bad));
  }
});

test('mergeCreated unions and de-duplicates every entity table', () => {
  const out = mergeCreated({ horses: ['h1'], classes: ['c1'] }, { horses: ['h1', 'h2'], venues: ['v1'] });
  assert.deepEqual(out, { horses: ['h1', 'h2'], riders: [], classes: ['c1'], events: [], venues: ['v1'] });
  assert.deepEqual(mergeCreated(null, null).riders, []);
});

test('pickSimilar keeps the best match per name at or above the threshold', () => {
  const rows = [
    { query: 'BELA ROSE', id: 'a', name: 'Bella Rose', normalized_name: 'BELLA ROSE', score: 0.75 },
    { query: 'BELA ROSE', id: 'b', name: 'Bela Roseanne', normalized_name: 'BELA ROSEANNE', score: 0.61 },
    { query: 'SARAH JAMES', id: 'c', name: 'Sarah Jones', normalized_name: 'SARAH JONES', score: 0.5 },
    { query: 'JON SMITH', id: 'd', name: 'John Smith', normalized_name: 'JOHN SMITH', score: '0.6153' },
    { query: 'SAME', id: 'e', name: 'Same', normalized_name: 'SAME', score: 1 }, // exact = not "new"
  ];
  const best = pickSimilar(rows);
  assert.equal(SIMILAR_MIN, 0.6);
  assert.deepEqual(best.get('BELA ROSE'), { id: 'a', name: 'Bella Rose', score: 0.75 });
  assert.deepEqual(best.get('JON SMITH'), { id: 'd', name: 'John Smith', score: 0.62 });
  assert.equal(best.has('SARAH JAMES'), false);
  assert.equal(best.has('SAME'), false);
});

test('isUngroundedCell reads the review flag as the grid stringifies it', () => {
  for (const v of ['horse', 'rider', 'horse,rider', ' rider ']) assert.equal(isUngroundedCell(v), true, v);
  for (const v of ['', null, undefined, 'false', 'class']) assert.equal(isUngroundedCell(v), false, String(v));
});

test('planRemoval removes only entities nothing else references', () => {
  const plan = planRemoval([
    { table: 'horses', id: 'h1', name: 'New Horse', refs: [{ table: 'round_results', count: 0 }, { table: 'media', count: 0 }] },
    { table: 'horses', id: 'h2', name: 'Watched Horse', refs: [{ table: 'watchlist_items', count: 2 }, { table: 'media', count: 1 }, { table: 'horse_aliases', count: 0 }] },
    { table: 'classes', id: 'c1', name: 'Class', refs: [] },
  ]);
  assert.deepEqual(plan.remove.map((e) => e.id), ['h1', 'c1']);
  assert.deepEqual(plan.keep, [{ table: 'horses', id: 'h2', name: 'Watched Horse', reason: 'still used by watchlists, photos' }]);
});

test('revertableFills reverts only values the import wrote and nobody changed', () => {
  const fills = [
    { table: 'horses', id: 'h1', column: 'breed', old: null, new: 'KWPN' },
    { table: 'horses', id: 'h1', column: 'sire', old: null, new: 'Cornet' },
    { table: 'events', id: 'e1', column: 'venue', old: 'Unknown', new: 'Woodhill' },
    { table: 'horses', id: 'gone', column: 'breed', old: null, new: 'TB' },
    { table: 'classes', id: 'c1', column: 'field_size', old: null, new: 12 },
  ];
  const current = new Map([
    ['horses|h1|breed', 'KWPN'],
    ['horses|h1|sire', 'Cornet (corrected)'],
    ['events|e1|venue', 'Woodhill'],
    ['classes|c1|field_size', 12],
  ]);
  const { revert, skip } = revertableFills(fills, current);
  assert.deepEqual(revert.map((f) => `${f.table}.${f.column}`), ['horses.breed', 'events.venue', 'classes.field_size']);
  assert.deepEqual(skip.map((f) => f.reason), ['changed since the import', 'row no longer exists']);
});
