import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeQuery } from '../url-state.mjs';

test('mergeQuery sets, replaces and drops empty keys', () => {
  assert.equal(mergeQuery('section=users', { q: 'ann', page: 2 }), 'section=users&q=ann&page=2');
  assert.equal(mergeQuery('section=users&q=ann&page=2', { q: '', page: 0 }), 'section=users');
  assert.equal(mergeQuery('', { role: 'ADMIN', q: null }), 'role=ADMIN');
});
