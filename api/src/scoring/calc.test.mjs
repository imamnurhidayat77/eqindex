// Unit tests from Charles v0.3 §14 worked examples + §4/§7/§10/§12/§13 rules.
// Run: node --test src/scoring/calc.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { divisionFor, classPoints, bestTen, assessStatus, starsFor, clearPct, awardDivision } from './calc.js';

const P = { clear: 10, doubleBonus: 5, placing: [5, 4, 3, 2, 1], classMax: 20, singleRoundMax: 15, twoPhaseMax: 15 };
const DIVS = [
  { key: 'development', min: null, max: 100 }, { key: 'copper', min: 100, max: 120 },
  { key: 'bronze', min: 120, max: 130 }, { key: 'silver', min: 130, max: 145 },
  { key: 'gold', min: 145, max: null },
];
const RULES = { divisions: DIVS, points: P, status: { clearRoute: 2, consecutiveRoute: 3, participationTop: 6, participationWindow: 10 } };
const RANK = { development: 0, copper: 1, bronze: 2, silver: 3, gold: 4, world_cup: 5 };

test('§4 divisions', () => {
  assert.equal(divisionFor(120, false, RULES), 'bronze');
  assert.equal(divisionFor(130, false, RULES), 'silver');
  assert.equal(divisionFor(145, false, RULES), 'gold');
  assert.equal(divisionFor(90, false, RULES), 'development');
  assert.equal(divisionFor(140, true, RULES), 'world_cup');
  assert.equal(divisionFor(null, false, RULES), null);
});

test('§10/§14 points', () => {
  assert.equal(classPoints({ clear: true, doubleClear: false, place: 1 }, P), 15);
  assert.equal(classPoints({ clear: true, doubleClear: true, place: 3 }, P), 18);
  assert.equal(classPoints({ clear: false, doubleClear: false, place: 1 }, P), 5);
  assert.equal(classPoints({ clear: true, doubleClear: true, place: 1 }, P), 20);
  assert.equal(classPoints({ clear: true, doubleClear: true, place: 9 }, P), 15);
  assert.equal(classPoints({ clear: true, doubleClear: false, place: 2, twoPhase: true }, P), 14);
});

test('§12 best ten = 112', () => {
  const r = bestTen([15, 14, 13, 10, 10, 10, 10, 10, 10, 10, 10, 10], 10);
  assert.equal(r.total, 112);
  assert.equal(r.counted, 10);
});

test('§7/§14 status routes', () => {
  const G = (clear) => ({ division: 'gold', clear });
  const S = (clear) => ({ division: 'silver', clear });
  // two Gold clears with a Silver start between → Gold promotion
  assert.equal(assessStatus([G(true), S(false), G(true)], RULES, RANK), 'gold');
  // non-clear inside target breaks the clear sequence
  assert.equal(assessStatus([G(true), G(false)], RULES, RANK), null);
  // three consecutive overall → Silver
  assert.equal(assessStatus([S(true), S(true), S(true)], RULES, RANK), 'silver');
});

test('§9 stars', () => {
  const s = starsFor(Array.from({ length: 12 }, (_, i) => ({ division: 'gold', doubleClear: i < 5 })));
  assert.equal(s.gold.stars, 12);
  assert.equal(s.gold.doubles, 5);
});

test('§13 clear percentage', () => {
  const r = clearPct(12, 15);
  assert.equal(r.num, 12); assert.equal(r.den, 15); assert.equal(r.pct, 80);
});

test('§13 award eligibility + late promotion', () => {
  assert.equal(awardDivision('gold', { silver: 12, gold: 2 }, 10, RANK), 'silver');
  assert.equal(awardDivision('gold', { silver: 12, gold: 11 }, 10, RANK), 'gold');
});
