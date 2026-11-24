// Unit/guard: admin + coach state-machine fixes stay in place.
// Source assertions (repo precedent: qa-critical.test.mjs in web-bossmedia).
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (p) => readFileSync(join(root, p), 'utf8');

describe('corrections inbox: no stale rows, no dead ends', () => {
  const s = src('app/admin/corrections/page.jsx');
  test('late responses cannot overwrite the current filter', () => {
    assert.match(s, /seq\.current === my/);
  });
  test('one decision at a time per row', () => {
    assert.match(s, /if \(busyId\) return/);
    assert.match(s, /disabled=\{busyId === r\.id\}/);
  });
  test('actions follow the row status, not the filter tab', () => {
    assert.match(s, /r\.status === 'open' \|\| r\.status === 'in_review'/);
    assert.match(s, /r\.status === 'open' && <button[\s\S]*?>Take up<\/button>/);
  });
  test('notes survive a 409 but clear on success', () => {
    assert.match(s, /delete c\[id\]/);
  });
});

describe('scoring versions: one mutation at a time', () => {
  const s = src('app/admin/scoring/page.jsx');
  test('every mutating path refuses while busy', () => {
    const hits = s.match(/busy\) return/g) || [];
    assert.ok(hits.length >= 7, `want ≥7 busy guards, got ${hits.length}`);
  });
  test('save still refuses non-drafts (guard kept, not replaced)', () => {
    assert.match(s, /sel\.status !== 'draft'/);
  });
});

