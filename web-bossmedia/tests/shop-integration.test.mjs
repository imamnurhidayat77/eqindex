// Integration: storefront ↔ API contract over HTTP.
// Needs: web-bossmedia dev on :3000 (+ API for /health). Skips when down.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { BOSS, APIB, getText, requireServer } from './helpers.mjs';

describe('storefront pages serve with their contracts', async () => {
  test('cart + pre-book + success(empty) + login render 200 with markers', async (t) => {
    await requireServer(t, BOSS);
    // Note: /photos/success is a client component — SSR always renders the
    // `checking` branch ("Confirming payment…"); the empty-link copy
    // ("No order in this link.") appears after hydration (verified in browser).
    for (const [path, marker] of [
      ['/cart', 'Cart.'],
      ['/pre-book', 'Pre-book your ride.'],
      ['/photos/success', 'Confirming payment'],
      ['/login', 'Welcome back.'],
      ['/media', 'My media.'],
    ]) {
      const { status, body } = await getText(`${BOSS}${path}`);
      assert.equal(status, 200, `${path} → ${status}`);
      assert.ok(body.includes(marker), `${path} missing marker: ${marker}`);
    }
  });

  test('studio pages serve for guests (gate is client-side, no 500s)', async (t) => {
    await requireServer(t, BOSS);
    for (const [path, marker] of [['/studio/upload', 'Upload'], ['/studio/library', 'Library']]) {
      const { status, body } = await getText(`${BOSS}${path}`);
      assert.equal(status, 200, `${path} → ${status}`);
      assert.ok(body.includes(marker), `${path} lost its shell`);
    }
  });
});

describe('api contract behind the shop', () => {
  test('health + one ranking shape', async (t) => {
    await requireServer(t, APIB);
    const h = await (await fetch(`${APIB}/health`)).json();
    assert.equal(h.ok, true);
    const r = await (await fetch(`${APIB}/rankings/horses?limit=1`)).json();
    assert.ok(Array.isArray(r.data) && r.data.length > 0, 'rankings/horses empty');
    assert.ok(r.data[0].horse_id && r.data[0].clear_pct !== undefined, 'horse shape changed');
  });
});
