// Unit: 3D merch model weight. Every product page downloads its model on
// open, so a raw generator export (10-19 MB each) must never ship again.
// Run scripts/optimize-models.mjs on any new .glb before committing it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname;
const MODELS = join(ROOT, 'public/models');
const MB = 1024 * 1024;
// The display horse is optional (behind "Show horse") and allowed more.
const BUDGET = { 'horse-warmblood.glb': 5 * MB, default: 2 * MB };

const glbs = readdirSync(MODELS, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith('.glb') && !f.includes('-template'));

test('every merch model stays inside its download budget', () => {
  assert.ok(glbs.length >= 9, 'expected the 9 merch models');
  for (const f of glbs) {
    const size = statSync(join(MODELS, f)).size;
    const name = f.split('/').pop();
    const budget = BUDGET[name] || BUDGET.default;
    assert.ok(size <= budget, `${f} is ${(size / MB).toFixed(1)} MB, budget ${(budget / MB).toFixed(1)} MB`);
  }
});

test('no merch component preloads models at import time', () => {
  // A module-level useGLTF.preload pulls every model on any merch page.
  for (const f of ['Merch3D.jsx', 'HorseStage.jsx', 'HorseGear.jsx']) {
    const src = readFileSync(join(ROOT, 'components', f), 'utf8');
    assert.doesNotMatch(src, /useGLTF\.preload\(/, `${f} preloads a model`);
  }
});

// Phones: a vertical swipe over the 3D stage must scroll the page, not spin
// the model. !important beats the inline touch-action OrbitControls writes.
test('3D canvas lets vertical swipes scroll the page', () => {
  const css = readFileSync(join(ROOT, 'components/MerchClient.module.css'), 'utf8');
  assert.match(css, /\.gl canvas \{[^}]*touch-action: pan-y !important/);
});
