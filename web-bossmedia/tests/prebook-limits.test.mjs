// Unit: pre-book input caps must match what the API keeps, or long values
// get cut on the order without the rider seeing it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const client = readFileSync(new URL('../components/PreBookClient.jsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../../api/src/routes/media.js', import.meta.url), 'utf8');

test('pre-book maxLength matches the API truncation', () => {
  const max = Object.fromEntries([...client.match(/const MAX_LEN = \{([^}]*)\}/)[1].matchAll(/(\w+): (\d+)/g)].map(([, k, v]) => [k, +v]));
  const cap = (field) => +api.match(new RegExp(`b\\.${field} \\|\\| ''\\)(?:\\.trim\\(\\))?\\.slice\\(0, (\\d+)\\)`))[1];
  assert.equal(max.name, cap('horse_name'));
  assert.equal(max.className, cap('class_name'));
  assert.equal(max.backNumber, cap('back_number'));
  assert.equal(max.phone, cap('phone'));
  assert.equal(max.musicTitle, cap('music_title'));
});
