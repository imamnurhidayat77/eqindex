import test from 'node:test';
import assert from 'node:assert/strict';
import { uniqueById } from '../unique-by-id.mjs';

test('uniqueById keeps the first occurrence and the original order', () => {
  const out = uniqueById([{ id: 'a', g: 1 }, { id: 'b', g: 1 }, { id: 'a', g: 2 }, { id: 'c', g: 2 }]);
  assert.deepEqual(out, [{ id: 'a', g: 1 }, { id: 'b', g: 1 }, { id: 'c', g: 2 }]);
  assert.deepEqual(uniqueById([]), []);
});
