// Bake: many-logo rows + overlay collapse execute and stay valid JPEGs.
// Runs sharp locally (no network, no DB) — mirrors the preview contract:
// one row that shrinks by count; overlays hold one badge per corner to 4,
// then a single row badge (corner-badge / round pill / minimal chip).
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { bakeVariant, isVariant } from './src/lib/logoBake.js';

async function png(w, h, r, g, b) {
  return sharp({ create: { width: w, height: h, channels: 4, background: { r, g, b, alpha: 1 } } })
    .png().toBuffer();
}
const photo = () => png(1200, 800, 20, 40, 60);
const logos = async (n) => {
  const out = [];
  for (let i = 0; i < n; i++) out.push(await png(200 + i * 10, 80, 200, 150 - i * 10, 40));
  return out;
};
async function metaOf(buf) {
  return sharp(buf).metadata();
}

describe('bakeVariant with many logos', () => {
  test('row variant bakes 8 logos into a valid jpeg', async () => {
    assert.ok(isVariant('banner-wave'));
    const out = await bakeVariant({
      photoBuf: await photo(), logoBufs: await logos(8),
      variant: 'banner-wave', positions: {}, ctx: {}, theme: 'light',
    });
    const meta = await metaOf(out);
    assert.equal(meta.format, 'jpeg');
    assert.equal(meta.width, 1200);
    assert.equal(meta.height, 800);
  });

  test('overlay variants collapse 6 logos into one badge without throwing', async () => {
    for (const variant of ['corner-badge', 'round-badge', 'minimal-corner']) {
      assert.ok(isVariant(variant));
      const out = await bakeVariant({
        photoBuf: await photo(), logoBufs: await logos(6),
        variant, positions: {}, ctx: {}, theme: 'light',
      });
      const meta = await metaOf(out);
      assert.equal(meta.format, 'jpeg', variant);
    }
  });

  test('all four corners paint without throwing', async () => {
    // positions arrive as an array in logo order (see the download path).
    const positions = ['bottom-left', 'bottom-right', 'top-right', 'top-left'];
    const bufs = await logos(4);
    for (const variant of ['corner-badge', 'round-badge', 'minimal-corner']) {
      const out = await bakeVariant({
        photoBuf: await photo(), logoBufs: bufs, variant,
        positions, ctx: {}, theme: 'light',
      });
      assert.equal((await metaOf(out)).format, 'jpeg', variant);
    }
  });

  test('single logo still bakes (regression)', async () => {
    const out = await bakeVariant({
      photoBuf: await photo(), logoBufs: await logos(1),
      variant: 'winner-banner', positions: {}, ctx: {}, theme: 'light',
    });
    assert.equal((await metaOf(out)).format, 'jpeg');
  });
});
