// Regression test: a classified-but-not-finished round (e.g. retired in the
// jump-off but officially 2nd) must keep its placing alongside the status.
// Run: node --test src/lib/evoevents.test.mjs  (no DB, no network)
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEvoEvents } from './evoevents.js';

const text = [
  '6 Treadlite Young Rider Series 1.25m Art 238 2.2 Hide  View full',
  'RESULTS',
  'Back No  Horse  Rider  Place  Time',
  '12  Oaks Centurian  Sophia Maud  2  70.00  0  0  R',
  '13  Global PH Cupid  Ella McKay  1  68.00  0  0  0',
  '14  Amorcito  Bailey Benshaw  E  0  0',
  '15  Lonely Star  Jane Doe  R  0  0',
].join('\n');

test('retired-but-2nd keeps placing + status', () => {
  const { records } = parseEvoEvents(text);
  const sophia = records.find((r) => r.rider_name === 'Sophia Maud');
  assert.ok(sophia, 'sophia row parsed');
  assert.equal(sophia.placing, 2);
  assert.equal(sophia.status, 'retired');
  assert.equal(sophia.horse_name, 'Oaks Centurian');
});

test('finished winner untouched', () => {
  const { records } = parseEvoEvents(text);
  const ella = records.find((r) => r.rider_name === 'Ella McKay');
  assert.ok(ella, 'ella row parsed');
  assert.equal(ella.placing, 1);
  assert.ok(!ella.status, 'no status for finished round');
});

test('eliminated keeps placing when present, status set', () => {
  const { records } = parseEvoEvents(text);
  const elim = records.find((r) => r.rider_name === 'Bailey Benshaw');
  assert.ok(elim, 'eliminated row parsed');
  assert.equal(elim.status, 'eliminated');
});

test('bare retired with no placing stays unplaced', () => {
  const { records } = parseEvoEvents(text);
  const lone = records.find((r) => r.rider_name === 'Jane Doe');
  assert.ok(lone, 'lone retired row parsed');
  assert.equal(lone.status, 'retired');
  assert.ok(lone.placing === null || lone.placing === undefined);
});
