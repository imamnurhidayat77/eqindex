// Per-photographer download prices (migration 106): static guards on media.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'src/routes/media.js'), 'utf8');

test('only ADMIN can change platform prices', () => {
  for (const verb of ['post', 'patch', 'delete']) {
    const m = src.match(new RegExp(`app\\.${verb}\\('/admin/license-tiers[^']*', needRole\\('(\\w+)'\\)`));
    assert.ok(m, `${verb} route exists`);
    assert.equal(m[1], 'ADMIN', `${verb} /admin/license-tiers must be ADMIN only`);
  }
});

test('photographers set their own price through my-prices, scoped to their profile', () => {
  assert.match(src, /app\.put\('\/admin\/my-prices\/:tier', needRole\('PHOTOGRAPHER'\)/);
  const put = src.slice(src.indexOf("app.put('/admin/my-prices/:tier'"), src.indexOf("app.put('/admin/my-prices/:tier'") + 1500);
  assert.match(put, /ownPhotographer\(pool, req\.authUser/);
});

test('both checkout copies charge the photographer price over the platform price', () => {
  const n = (src.match(/SELECT price_cents FROM photographer_prices WHERE photographer_id = \$1 AND tier_id = \$2/g) || []).length;
  assert.equal(n, 2);
  const j = (src.match(/COALESCE\(pp\.price_cents, t\.price_cents\) AS tier_price/g) || []).length;
  assert.equal(j, 2);
});

test('an admin without an explicit photographer acts as their own linked profile', () => {
  const fn = src.slice(src.indexOf('async function ownPhotographer('), src.indexOf('async function ownPhotographerId('));
  assert.match(fn, /WHERE user_id = \$1 AND is_active/);
  assert.ok(fn.indexOf('user_id = $1') < fn.indexOf('activePhotographer(poolQ, null)'));
});

test('pre-book is Boss Media (ADMIN) only, finished reels stay open to photographers', () => {
  for (const r of ["app.get('/admin/reel-products'", "app.post('/admin/reel-products'", "app.patch('/admin/reel-products/:id'",
    "app.delete('/admin/reel-products/:id'", "app.get('/admin/reel-orders'", "app.patch('/admin/reel-orders/:id'"]) {
    assert.ok(src.includes(`${r}, needRole('ADMIN')`), `${r} must be ADMIN only`);
  }
  assert.ok(src.includes("app.post('/admin/media/upload-url', needRole('PHOTOGRAPHER')"));
});
