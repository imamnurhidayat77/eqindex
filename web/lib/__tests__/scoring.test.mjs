import test from 'node:test';
import assert from 'node:assert/strict';
import { pointsLine, rulePoints, rulesTag } from '../scoring.js';

const P = { points: { clear: 10, doubleBonus: 5, placing: [5, 4, 3, 2, 1], classMax: 20 } };

test('pointsLine: one-line formula, no hardcoded numbers at call sites', () => {
  assert.equal(pointsLine(P), 'clear 10 · double 5 · placing 5/4/3/2/1 · cap 20');
  assert.ok(pointsLine(null).includes('–'));
});

test('rulePoints: clear + double + placing, capped, top-5 only', () => {
  assert.equal(rulePoints({ place: 1, clear: true, doubleClear: true }, P), 20); // 10+5+5 capped
  assert.equal(rulePoints({ place: 3, clear: true, doubleClear: false }, P), 13); // 10+3
  assert.equal(rulePoints({ place: 2, clear: false, doubleClear: false }, P), 4); // placing only
  assert.equal(rulePoints({ place: 6, clear: true, doubleClear: false }, P), 10); // outside table
  assert.equal(rulePoints({ place: 1, clear: true, doubleClear: true, finished: false }, P), 0);
  assert.equal(rulePoints({ place: null, clear: true, doubleClear: false }, P), 10);
});

test('rulesTag: versioned when live, defaults otherwise', () => {
  assert.equal(rulesTag({ live: true, version: 2 }), 'Points · v2');
  assert.equal(rulesTag({ live: false }), 'Points · defaults');
  assert.equal(rulesTag(null), 'Points');
});
