import test from 'node:test';
import assert from 'node:assert/strict';
import { placingsLookWrong, oddPlacings, reviewGroups, withRecords, failureSummary, commitLockReason } from '../importReview.js';

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
  assert.deepEqual(groups.map((g) => [g.name, g.rows.length, g.issueCount, g.failedCount]), [['A', 2, 2, 1], ['B Series', 1, 1, 0], ['C', 3, 1, 0]]);
  assert.deepEqual(groups[0].rows[0].issues, ['ungrounded']);
  assert.deepEqual(groups[0].rows[1].issues, ['failed']);
  assert.deepEqual(groups[1].rows[0].issues, ['no_series']); // "new horse" is info, not an issue
  assert.deepEqual(groups[1].rows[0].info, ['new_horse']);
  assert.deepEqual(groups[2].rows.map((r) => r.issues), [[], ['placing'], []]); // only the 3 after 1 is odd; eliminated ignored
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

test('reviewGroups flags similar existing horse/rider from the dry-run', () => {
  const groups = reviewGroups([{ class_name: 'A', horse_name: 'Bela Rose', rider_name: 'Jon Smith', placing: '1' }], {
    rows: [{ line: 1, ok: true, preview: { new_horse: true, new_rider: true,
      similar_horse: { id: 'h', name: 'Bella Rose', score: 0.75 }, similar_rider: { id: 'r', name: 'John Smith', score: 0.62 } } }],
    summary: {},
  });
  assert.deepEqual(groups[0].rows[0].issues, ['similar_horse', 'similar_rider']);
  assert.deepEqual(groups[0].rows[0].info, ['new_horse', 'new_rider']);
});

test('oddPlacings flags only the rows that break the ranking', () => {
  assert.deepEqual(oddPlacings([1, 2, 3]), []);
  assert.deepEqual(oddPlacings([1, 1, 3]), []);
  assert.deepEqual(oddPlacings([1, 2, 4]), [2]);
  // two rounds listed under one class name: 1,1,2,2,3,3 — one flag per step, not every row
  assert.equal(oddPlacings([1, 2, 3, 1, 2, 3]).length, 2);
});

test('failureSummary groups failed rows by message, most frequent first', () => {
  const s = failureSummary({ rows: [
    { line: 1, ok: true },
    { line: 2, ok: false, errors: ['duplicate of an existing round'] },
    { line: 3, ok: false, errors: ['duplicate of an existing round'] },
    { line: 4, ok: false, errors: ['rider_name required', 'placing must be a positive integer'] },
    { line: 5, ok: false },
  ] });
  assert.deepEqual(s.map((x) => [x.message, x.count]), [
    ['duplicate of an existing round', 2], ['rider_name required', 1], ['placing must be a positive integer', 1], ['failed', 1]]);
  assert.deepEqual([...s[0].indexes], [1, 2]);
  assert.deepEqual(failureSummary(null), []);
});

test('a similar-name suggestion already taken is no longer an issue', () => {
  const preview = { rows: [{ line: 1, ok: true, preview: { new_horse: true, similar_horse: { id: 'h', name: 'Triple Star Galaxy (CHB Blue)', score: 0.68 } } }], summary: {} };
  const before = reviewGroups([{ class_name: 'A', horse_name: 'Triple Star Galaxy', rider_name: 'R' }], preview);
  assert.deepEqual(before[0].rows[0].issues, ['similar_horse']);
  const after = reviewGroups([{ class_name: 'A', horse_name: 'triple star galaxy (chb blue) ', rider_name: 'R' }], preview);
  assert.deepEqual(after[0].rows[0].issues, []);
});

test('acknowledged series classes and checked names stop counting as issues', () => {
  const records = [{ class_name: 'Mini Prix', horse_name: 'H', rider_name: 'R', ungrounded: ['horse'] }];
  const preview = { rows: [{ line: 1, ok: true, preview: {} }], summary: { series_blocking: [{ name: 'Mini Prix', rows: 1 }] } };
  assert.deepEqual(reviewGroups(records, preview)[0].rows[0].issues, ['ungrounded', 'no_series']);
  assert.deepEqual(reviewGroups(records, preview, { seriesAck: true, namesAck: true })[0].rows[0].issues, []);
});

test('commitLockReason names the next thing to do, null when Commit may run', () => {
  const fresh = { dry_run: true };
  assert.equal(commitLockReason({ preview: null }), 'Validate first');
  assert.equal(commitLockReason({ preview: { ...fresh, stale: true } }), 'Rows changed — validate again');
  assert.equal(commitLockReason({ preview: fresh, seriesBlockingCount: 2 }), 'Confirm the series classes');
  assert.equal(commitLockReason({ preview: fresh, seriesBlockingCount: 2, seriesAck: true }), null);
  assert.equal(commitLockReason({ preview: fresh, ungroundedCount: 1 }), 'Check the flagged names');
  assert.equal(commitLockReason({ preview: fresh, resume: { from: 50 } }), 'Resume the stopped commit below');
  assert.equal(commitLockReason({ preview: fresh, fileBlocked: 'x' }), 'File could not be read reliably');
  assert.equal(commitLockReason({ preview: { dry_run: false } }), 'Validate first');
});

test('provisional rows are info (not issues) and need their own confirmation', () => {
  const g = reviewGroups([{ class_name: 'A', horse_name: 'H', rider_name: 'R', results_approved: false }], null);
  assert.deepEqual(g[0].rows[0].info, ['provisional']);
  assert.deepEqual(g[0].rows[0].issues, []);
  const fresh = { dry_run: true };
  assert.equal(commitLockReason({ preview: fresh, provisionalCount: 3 }), 'Confirm provisional results');
  assert.equal(commitLockReason({ preview: fresh, provisionalCount: 3, provisionalAck: true }), null);
});
