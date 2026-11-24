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

describe('picker templates (short-edge sized, class + moment on all five)', () => {
  test('bake landscape and portrait photos at their own size', async () => {
    for (const [w, h] of [[1200, 800], [800, 1200]]) {
      const photoBuf = await png(w, h, 20, 40, 60);
      for (const variant of ['fade-footer', 'sponsor-bar', 'mat-frame', 'poster-panel', 'logo-plate',
        'header-bar', 'side-column', 'ribbon-tag', 'split-footer',
        'broadcast', 'keyline', 'result-card', 'rosette', 'angle']) for (const theme of ['light', 'dark']) {
        assert.ok(isVariant(variant), variant);
        for (const n of [1, 3, 6, 8]) {
          const out = await bakeVariant({
            photoBuf, logoBufs: await logos(n), variant,
            positions: ['bottom-right', 'top-left', 'top-right', 'bottom-left'],
            ctx: { event: 'Auckland SJ & Waitemata SJ Spring Showjumping Festival', className: '1.20m Grand Prix', moment: 'pb' },
            designTags: { result: '2nd place' },
            theme,
          });
          const meta = await metaOf(out);
          assert.equal(meta.format, 'jpeg', `${variant} ${theme} ${w}x${h} ${n}`);
          assert.equal(meta.width, w);
          assert.equal(meta.height, h);
        }
      }
    }
  });

  test('mat-frame paints a white margin around the photo', async () => {
    const out = await bakeVariant({
      photoBuf: await png(1200, 800, 20, 40, 60), logoBufs: await logos(1),
      variant: 'mat-frame', positions: [], ctx: {}, theme: 'light',
    });
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    const px = (x, y) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
    assert.ok(px(5, 5).every((c) => c > 240), 'corner is mat white');
    assert.ok(px(600, 300).every((c) => c < 90), 'centre is the photo');
  });

  test('the buyer moment reaches the baked file', async () => {
    const base = {
      photoBuf: await png(1200, 800, 20, 40, 60), logoBufs: await logos(2),
      variant: 'fade-footer', positions: [], ctx: { event: 'Spring Festival', className: '1.20m' }, theme: 'light',
    };
    const none = await bakeVariant(base);
    const typed = await bakeVariant({ ...base, designTags: { result: 'Clear round' } });
    const fallback = await bakeVariant({ ...base, ctx: { ...base.ctx, moment: 'win' } });
    assert.ok(!none.equals(typed), 'typed moment changes the pixels');
    assert.ok(!none.equals(fallback), 'photo moment is used when nothing is typed');
  });

  test('dark and light bake differently for every picker template', async () => {
    const photoBuf = await png(1200, 800, 20, 40, 60);
    for (const variant of ['fade-footer', 'sponsor-bar', 'mat-frame', 'poster-panel', 'logo-plate',
      'header-bar', 'side-column', 'ribbon-tag', 'split-footer',
        'broadcast', 'keyline', 'result-card', 'rosette', 'angle']) {
      const base = { photoBuf, logoBufs: await logos(2), variant, positions: [], ctx: { event: 'Spring Festival', className: '1.20m' }, designTags: { result: 'Winner' } };
      const light = await bakeVariant({ ...base, theme: 'light' });
      const dark = await bakeVariant({ ...base, theme: 'dark' });
      assert.ok(!light.equals(dark), `${variant} light != dark`);
    }
  });
});
