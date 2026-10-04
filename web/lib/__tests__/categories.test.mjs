import test from 'node:test';
import assert from 'node:assert/strict';
import { keyOptions, keyLabel, resolveKey, FALLBACK_CATS } from '../categories.js';

const MASTER = [
  { key: 'pro', title: 'Best Pro Rider', label: 'Pro Rider' },
  { key: 'young', title: 'Best Young Rider', label: 'Young Rider' },
  { key: 'junior', title: 'Best Junior Rider', label: 'Junior Rider' },
];

test('keyOptions: values are master keys, labels human-readable', () => {
  const opts = keyOptions(MASTER);
  assert.deepEqual(opts.map((o) => o.value), ['pro', 'young', 'junior']);
  assert.deepEqual(opts.map((o) => o.label), ['Pro Rider', 'Young Rider', 'Junior Rider']);
});

test('keyOptions: falls back to seed list when master unreachable', () => {
  assert.ok(keyOptions(null).length === FALLBACK_CATS.length);
  assert.ok(keyOptions([]).some((o) => o.value === 'pony'));
});

test('keyOptions: unknown stored value stays visible', () => {
  const opts = keyOptions(MASTER, 'veteran');
  assert.ok(opts.some((o) => o.value === 'veteran' && /removed/.test(o.label)));
  assert.equal(keyOptions(MASTER, 'young').length, MASTER.length); // no dup
});

test('keyLabel: resolves key, dashes empty, passes through unknown', () => {
  assert.equal(keyLabel(MASTER, 'young'), 'Young Rider');
  assert.equal(keyLabel(MASTER, null), '—');
  assert.equal(keyLabel(MASTER, 'veteran'), 'veteran');
  assert.equal(keyLabel(null, 'pony'), 'Pony Rider'); // fallback list
});

test('resolveKey: keys, labels and legacy URLs resolve; unknown → empty', () => {
  assert.equal(resolveKey(MASTER, 'young'), 'young');
  assert.equal(resolveKey(MASTER, 'Young Rider'), 'young');
  assert.equal(resolveKey(MASTER, 'Junior'), 'junior'); // legacy label
  assert.equal(resolveKey(MASTER, 'young rider'), 'young');
  assert.equal(resolveKey(MASTER, 'Under 25'), ''); // no bucket — unfiltered
  assert.equal(resolveKey(MASTER, ''), '');
  assert.equal(resolveKey(null, 'pony'), 'pony'); // fallback list
});
