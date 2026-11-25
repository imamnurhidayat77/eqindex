import test from 'node:test';
import assert from 'node:assert/strict';
import { placingsLookWrong, reviewGroups, withRecords } from '../importReview.js';

test('placingsLookWrong: ties allowed, gaps and impossible ties flagged', () => {
  assert.equal(placingsLookWrong([3, 1, 1]), false);
  assert.equal(placingsLookWrong([1, 2, 3]), false);
  assert.equal(placingsLookWrong([1, 2, 4]), true);
  assert.equal(placingsLookWrong([1, 1, 2]), true);
  assert.equal(placingsLookWrong([]), false);
});

test('reviewGroups groups by class + date and collects row issues', () => {
  const records = [
    { class_name: 'A', rider_name: 'R1', horse_name: 'H1', placing: '1', ungrounded: ['horse'] },
    { class_name: 'A', rider_name: 'R2', horse_name: 'H2', placing: '2' },
    { class_name: 'B Series', rider_name: 'R3', horse_name: 'H3', placing: '1' },
    { class_name: 'C', rider_name: 'R4', horse_name: 'H4', placing: '1' },
    { class_name: 'C', rider_name: 'R5', horse_name: 'H5', placing: '3' },
    { class_name: 'C', rider_name: 'R6', horse_name: 'H6', placing: '9', status: 'eliminated' },
  ];
  const preview = {
    rows: [
      { line: 1, ok: true, preview: {} },
      { line: 2, ok: false, errors: ['placing must be a positive integer'] },
      { line: 3, ok: true, preview: { new_horse: true } },
    ],
    summary: { series_blocking: [{ name: 'B Series', rows: 1 }] },
  };
  const groups = reviewGroups(records, preview);
  assert.deepEqual(groups.map((g) => [g.name, g.rows.length, g.issueCount]), [['A', 2, 2], ['B Series', 1, 1], ['C', 3, 2]]);
  assert.deepEqual(groups[0].rows[0].issues, ['ungrounded']);
  assert.deepEqual(groups[0].rows[1].issues, ['failed']);
  assert.deepEqual(groups[1].rows[0].issues, ['no_series', 'new_horse']);
  assert.deepEqual(groups[2].rows.map((r) => r.issues), [['placing'], ['placing'], []]); // gap 1,3; eliminated ignored
  assert.equal(groups[2].rows[2].index, 5);
});

test('reviewGroups without a preview only reports source-side issues', () => {
  const groups = reviewGroups([{ class_name: 'A', placing: '1' }], null);
  assert.equal(groups[0].issueCount, 0);
  assert.equal(groups[0].rows[0].result, null);
});

test('withRecords recounts stats and keeps the rest of the analysis', () => {
  const a = { detected: { type: 'ai' }, warnings: ['w'], stats: { rounds: 3, with_series: 2, finished: 3 }, records: [] };
  const next = withRecords(a, [{ series_key: 'x' }, {}]);
  assert.deepEqual(next.stats, { rounds: 2, with_series: 1, finished: 3 });
  assert.deepEqual(next.warnings, ['w']);
});
