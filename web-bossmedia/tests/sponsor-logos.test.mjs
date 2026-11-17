// Unit: multi-sponsor toggle (buyer picks up to 8 logos per photo).
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SPONSOR_LOGOS, designTagsSig, isWinningResult, normalizeTagDraft, toggleLogoIds } from '../lib/sponsor-logos.mjs';

test('caps at the backend limit (rows shrink, overlays collapse past 4)', () => {
  assert.equal(MAX_SPONSOR_LOGOS, 8);
});

test('adds until full, then refuses without dropping', () => {
  let r = toggleLogoIds([], 'a');
  assert.deepEqual(r, { ids: ['a'], added: true, full: false });
  for (const id of ['b', 'c', 'd', 'e', 'f', 'g', 'h']) {
    r = toggleLogoIds(r.ids, id);
    assert.equal(r.added, true, `adding ${id}`);
  }
  assert.deepEqual(r.ids, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  r = toggleLogoIds(r.ids, 'i');
  assert.deepEqual(r, { ids: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], added: false, full: true });
});

test('toggles off an already-picked logo', () => {
  const r = toggleLogoIds(['a', 'b'], 'a');
  assert.deepEqual(r, { ids: ['b'], added: false, full: false });
});

test('stringifies ids and tolerates a missing list', () => {
  assert.deepEqual(toggleLogoIds(null, 7).ids, ['7']);
  assert.deepEqual(toggleLogoIds(['7'], 7).ids, []);
});

test('winner templates gate on the result text itself, no checkbox', () => {
  for (const w of ['Winner', 'winner', ' 1st ', '1st place', 'Champion', 'Gold', '1', 'WIN']) {
    assert.equal(isWinningResult(w), true, JSON.stringify(w));
  }
  for (const n of ['', 'Clear', '2nd', 'Debut', 'PB', 'Jump-off', null, undefined]) {
    assert.equal(isWinningResult(n), false, JSON.stringify(n));
  }
});

test('old won-flag drafts read back as the default winner word', () => {
  assert.deepEqual(normalizeTagDraft(null), { class: '', result: '' });
  assert.deepEqual(normalizeTagDraft({ won: true }), { class: '', result: 'Winner' });
  assert.deepEqual(normalizeTagDraft({ won: true, result: 'Clear' }), { class: '', result: 'Clear' });
  assert.deepEqual(normalizeTagDraft({ class: ' 1.20m ', result: 'x'.repeat(99) }).class, '1.20m');
});

test('tag fingerprint covers class + result', () => {
  assert.equal(designTagsSig(null), '');
  assert.equal(designTagsSig({ class_name: 'A' }), 'A||');
  assert.equal(designTagsSig({ class_name: 'A', result: '1st' }), 'A||1st');
});
