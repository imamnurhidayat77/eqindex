import test from 'node:test';
import assert from 'node:assert/strict';
import { nzDay, fmtDay, fmtRange } from '../dates.js';

test('nzDay: same NZ day whatever timezone the API serialised in', () => {
  assert.equal(nzDay('2026-10-09T11:00:00.000Z'), '2026-10-10'); // API on NZ time (NZDT)
  assert.equal(nzDay('2026-10-10T00:00:00.000Z'), '2026-10-10'); // API on UTC
  assert.equal(nzDay('2026-07-31T12:00:00.000Z'), '2026-08-01'); // NZST winter
  assert.equal(nzDay('2026-10-10'), '2026-10-10');
  assert.equal(nzDay(null), '');
  assert.equal(nzDay('nope'), '');
});

test('fmtDay / fmtRange', () => {
  assert.equal(fmtDay('2026-10-09T11:00:00.000Z'), '10 Oct 2026');
  assert.equal(fmtDay(''), '—');
  assert.equal(fmtRange('2026-10-09T11:00:00.000Z', '2026-10-10T11:00:00.000Z'), '10–11 Oct 2026');
  assert.equal(fmtRange('2026-09-30', '2026-10-02'), '30 Sep – 2 Oct 2026');
  assert.equal(fmtRange('2026-12-30', '2027-01-02'), '30 Dec 2026 – 2 Jan 2027');
  assert.equal(fmtRange('2026-10-10', '2026-10-10'), '10 Oct 2026');
  assert.equal(fmtRange(null, null), 'Date TBC');
});
