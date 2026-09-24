import test from 'node:test';
import assert from 'node:assert/strict';
import { projectForm, recommendHeight, matchupEdge, suggestPartners } from '../forecast.js';
import { HEIGHT_BANDS, heightParams, heightLabel } from '../heights.js';

const rising = [
  { eq: 60, clear: 40, faults: 5, starts: 4 },
  { eq: 66, clear: 55, faults: 4, starts: 5 },
  { eq: 72, clear: 65, faults: 3, starts: 5 },
  { eq: 78, clear: 75, faults: 2, starts: 6 },
];

test('projectForm: rising trend projects up with medium+ confidence', () => {
  const f = projectForm(rising);
  assert.ok(f);
  assert.equal(f.direction, 'up');
  assert.ok(f.eq > 78 && f.eq <= 99);
  assert.ok(['Medium', 'High'].includes(f.confidence));
});

test('projectForm: thin data returns null (honest, no fabrication)', () => {
  assert.equal(projectForm([]), null);
  assert.equal(projectForm([{ eq: 70, clear: 60, faults: 2, starts: 2 }]), null);
  assert.equal(projectForm(rising.slice(0, 2)), null);
});

test('projectForm: flat trend stays within bounds', () => {
  const flat = [70, 71, 69, 70].map((eq) => ({ eq, clear: 60, faults: 2, starts: 5 }));
  const f = projectForm(flat);
  assert.ok(f && f.direction === 'flat');
  assert.ok(f.clear >= 0 && f.clear <= 100 && f.faults >= 0);
});

test('recommendHeight: optimal = volume + clear>=60, stretch when hot', () => {
  const rec = recommendHeight([
    { label: '1.20m', cm: 120, rounds: 6, clear: 82 },
    { label: '1.30m', cm: 130, rounds: 4, clear: 64 },
    { label: '1.40m', cm: 140, rounds: 1, clear: 50 },
  ]);
  assert.equal(rec.optimal.label, '1.20m');
  assert.equal(rec.stretch.label, '1.30m');
  assert.equal(recommendHeight([]), null);
});

test('matchupEdge: gaps under 3 are noise', () => {
  assert.equal(matchupEdge(80, 81, 4, 4).favored, 'Even');
  const e = matchupEdge(92, 87, 16, 24);
  assert.equal(e.favored, 'A');
  assert.equal(e.edge, 5);
});

test('suggestPartners: excludes ridden, prefers height match', () => {
  const out = suggestPartners({
    riddenIds: ['c'], riderBestCm: 130,
    horses: [
      { id: 'a', name: 'X', eq: 90, bestCm: 130, starts: 10 },
      { id: 'b', name: 'Y', eq: 85, bestCm: 140, starts: 8 },
      { id: 'c', name: 'Z', eq: 99, bestCm: 130, starts: 20 },
    ],
  });
  assert.equal(out.length, 2);
  assert.equal(out[0].id, 'a'); // exact height match beats higher-EQ distant horse
  assert.ok(!out.some((h) => h.id === 'c'));
});

test('heights: shared vocabulary is sane', () => {
  assert.deepEqual(heightParams(''), {});
  assert.deepEqual(heightParams('130-140'), { height_min: '130', height_max: '140' });
  assert.deepEqual(heightParams('140-'), { height_min: '140' });
  assert.equal(heightLabel('130-140'), '1.30m – 1.40m');
  assert.ok(HEIGHT_BANDS.length === 5);
});
