// Full-res Boss Media branding for community downloads (sharp + ffmpeg, no DB).
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const ffmpegPath = require('ffmpeg-static');
const { brandBadge, brandPhotoBuffer } = require('./src/lib/communityBrand.js');
const { renderBranded, probeDims } = require('./src/lib/reelProcess.js');

const grey = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: '#808080' } }).jpeg().toBuffer();

async function regionStdev(buf, left, top, width, height) {
  // stats() reads the whole input, so materialise the crop first.
  const crop = await sharp(buf).extract({ left, top, width, height }).png().toBuffer();
  const st = await sharp(crop).stats();
  return st.channels[0].stdev;
}

test('badge scales with the short side and never drops below the minimum', () => {
  assert.equal(brandBadge(4000).pad, 140);
  assert.equal(brandBadge(100).pad, 18);
  assert.equal(brandBadge(1080).pad, brandBadge(1080).pad); // rotation-invariant input
});

test('photo keeps full resolution and carries the mark bottom-right only', async () => {
  const out = await brandPhotoBuffer(await grey(3000, 2000));
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, 3000);
  assert.equal(meta.height, 2000);
  assert.ok(await regionStdev(out, 2000, 1750, 1000, 250) > 5, 'mark visible bottom-right');
  assert.ok(await regionStdev(out, 0, 0, 1000, 250) < 2, 'top-left untouched');
});

test('reel renders at full resolution with the badge', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-test-'));
  const src = path.join(dir, 'in.mp4');
  const made = spawnSync(ffmpegPath, ['-y', '-f', 'lavfi', '-i', 'color=c=gray:s=1281x721:d=1',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', src]);
  assert.equal(made.status, 0, String(made.stderr).slice(-300));
  const badge = brandBadge(721);
  const badgePath = path.join(dir, 'badge.png');
  fs.writeFileSync(badgePath, await sharp(badge.svg).png().toBuffer());
  const outPath = await renderBranded(fs.createReadStream(src), badgePath, badge.pad);
  const dims = await probeDims(fs.createReadStream(outPath));
  assert.deepEqual(dims, { width: 1280, height: 720 }); // even-rounded, not downscaled
  const frame = path.join(dir, 'f.png');
  spawnSync(ffmpegPath, ['-y', '-i', outPath, '-vframes', '1', frame]);
  const png = fs.readFileSync(frame);
  assert.ok(await regionStdev(png, 880, 600, 400, 120) > 5, 'badge visible bottom-right');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(outPath, { force: true });
});
