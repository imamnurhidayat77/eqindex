// Exact-variant bake: no DB/R2 — synthetic buffers only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { LOGO_VARIANTS, VARIANT_TO_TEMPLATE, templateOf, isVariant, bakeVariant } from './logoBake.js';

const here = dirname(fileURLToPath(import.meta.url));
const jsx = readFileSync(join(here, '..', '..', '..', 'web-bossmedia', 'components', 'SponsorTemplates.jsx'), 'utf8');

test('19 variants, unique ids', () => {
  assert.equal(LOGO_VARIANTS.length, 19);
  assert.equal(new Set(LOGO_VARIANTS).size, 19);
});

test('backend variant list + mapping mirror the frontend (drift guard)', () => {
  const ids = [...jsx.matchAll(/\{ id: '([a-z-]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...LOGO_VARIANTS].sort(), [...ids].sort(), 'logoBake LOGO_VARIANTS == frontend TEMPLATE_VARIANTS');
  const map = Object.fromEntries(
    [...jsx.matchAll(/'([a-z-]+)': '(corner|banner|top|minimal|winner|bottombar)'/g)].map((m) => [m[1], m[2]]));
  for (const id of LOGO_VARIANTS) {
    assert.equal(VARIANT_TO_TEMPLATE[id], map[id], `mapping drift for ${id}`);
    assert.equal(templateOf(id), map[id]);
    assert.ok(isVariant(id));
  }
  assert.equal(templateOf('nope'), 'corner');
  assert.ok(!isVariant('nope'));
});

test('every variant bakes to a valid JPEG (synthetic photo + logo)', async () => {
  const photo = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#3a5a3a' } })
    .jpeg().toBuffer();
  const logo = await sharp({ create: { width: 400, height: 120, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .png().toBuffer();
  const ctx = { event: 'Takapoto Showjumping', className: 'Horse 1.20m (238.2.1)', subject: 'Bruno × Muzi James' };
  for (const v of LOGO_VARIANTS) {
    const out = await bakeVariant({ photoBuf: photo, logoBufs: [logo], variant: v, positions: ['bottom-left'], ctx, theme: 'light' });
    const meta = await sharp(out).metadata();
    assert.equal(meta.format, 'jpeg', `${v} output jpeg`);
    assert.equal(meta.width, 1200, `${v} keeps photo width`);
    assert.equal(meta.height, 800, `${v} keeps photo height`);
  }
});

test('dark theme only affects the three strip variants', async () => {
  const photo = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#3a5a3a' } }).jpeg().toBuffer();
  const ctx = { event: 'E', className: 'C', subject: 'S' };
  for (const v of ['banner-wave', 'square-bar', 'top-banner']) {
    const light = await bakeVariant({ photoBuf: photo, logoBufs: [], variant: v, positions: [], ctx, theme: 'light' });
    const dark = await bakeVariant({ photoBuf: photo, logoBufs: [], variant: v, positions: [], ctx, theme: 'dark' });
    assert.notDeepEqual(light, dark, `${v} theme changes output`);
  }
  const a = await bakeVariant({ photoBuf: photo, logoBufs: [], variant: 'winner-side', positions: [], ctx, theme: 'light' });
  const b = await bakeVariant({ photoBuf: photo, logoBufs: [], variant: 'winner-side', positions: [], ctx, theme: 'dark' });
  assert.deepEqual(a, b, 'non-themed variant ignores theme');
});

test('unknown variant throws', async () => {
  const photo = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#000' } }).jpeg().toBuffer();
  await assert.rejects(() => bakeVariant({ photoBuf: photo, logoBufs: [], variant: 'nope', positions: [], ctx: {}, theme: 'light' }));
});
