// Unit: keyset cursor helpers used by media galleries and admin tables (no DB).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { readCursor, keysetCond, keysetPage, likeTerm } = require('./src/lib/http.js');

const ID = '0b6c2f8e-5a1d-4c3e-9f7a-2d4b6e8f0a1c';
const row = (id, ts) => ({ id, _cursor_ts: ts, name: id });

test('keysetPage returns a cursor only when an extra row exists', () => {
  const rows = [row(ID, '2026-11-26T10:00:00.123456'), row('x', '2026-11-26T09:00:00.000001')];
  const full = keysetPage(rows.slice(), 1);
  assert.equal(full.data.length, 1);
  assert.equal(full.data[0]._cursor_ts, undefined);
  assert.deepEqual(readCursor(full.next_cursor), { ts: '2026-11-26T10:00:00.123456', id: ID });
  assert.equal(keysetPage(rows.slice(0, 1), 1).next_cursor, null);
  assert.deepEqual(keysetPage([], 10), { data: [], next_cursor: null });
});

test('readCursor rejects junk and treats empty as first page', () => {
  assert.equal(readCursor(undefined), null);
  assert.equal(readCursor(''), null);
  assert.equal(readCursor('garbage'), false);
  assert.equal(readCursor(Buffer.from(`2026-11-26|${ID}`).toString('base64url')), false);
  assert.equal(readCursor(Buffer.from("2026-11-26T10:00:00.123456|1' OR 1=1").toString('base64url')), false);
});

test('keysetCond appends both params and numbers them after existing ones', () => {
  const params = ['a'];
  const sql = keysetCond('m.created_at', 'm.id', { ts: '2026-11-26T10:00:00.123456', id: ID }, params);
  assert.deepEqual(params, ['a', '2026-11-26T10:00:00.123456', ID]);
  assert.match(sql, /\(m\.created_at, m\.id\) < \(\(\$2::timestamp AT TIME ZONE 'UTC'\), \$3::uuid\)/);
});

test('likeTerm escapes wildcards and caps length', () => {
  assert.equal(likeTerm('  '), null);
  assert.equal(likeTerm('50%_off'), '%50\\%\\_off%');
  assert.equal(likeTerm('a'.repeat(300)).length, 102);
});
