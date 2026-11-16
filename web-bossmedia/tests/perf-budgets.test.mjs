// Performance smoke: mean-of-5 latency budgets on local dev.
// Generous on purpose (dev ≠ prod): failures mean real regression, not noise.
// Skips when the servers are down.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { BOSS, APIB, meanMs, requireServer } from './helpers.mjs';

const BUDGETS = [
  ['boss:/cart', `${BOSS}/cart`, 2500],
  ['boss:/pre-book', `${BOSS}/pre-book`, 2500],
  ['boss:/photos/success', `${BOSS}/photos/success`, 2500],
  ['api:/health', `${APIB}/health`, 800],
  ['api:/rankings/horses?limit=3', `${APIB}/rankings/horses?limit=3`, 2000],
];

describe('latency budgets (mean of 5, local dev)', () => {
  for (const [name, url, budget] of BUDGETS) {
    test(`${name} < ${budget}ms mean`, async (t) => {
      await requireServer(t, url.startsWith(BOSS) ? BOSS : APIB);
      const { mean, p50, max } = await meanMs(url);
      console.log(`  ${name}: mean=${mean.toFixed(0)}ms p50=${p50.toFixed(0)}ms max=${max.toFixed(0)}ms`);
      assert.ok(mean < budget, `${name} mean ${mean.toFixed(0)}ms over ${budget}ms budget`);
    });
  }
});
