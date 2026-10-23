// Re-render reel teasers from stored originals with the current pipeline:
// light-watermarked 640px preview + CLEAN poster (no watermark).
// Use after changing watermark style or poster sourcing.
// Safe to re-run (idempotent per row, overwrites same keys).
//
//   node scripts/repair-reel-teasers.mjs [--dry] [--id=<uuid>]
import 'dotenv/config';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pg = require('pg');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const mediaStore = require('../src/lib/mediaStore.js');
const { probeDims, renderPreview, renderPoster } = require('../src/lib/reelProcess.js');

const { Pool } = pg;
const DRY = process.argv.includes('--dry');
const onlyId = (process.argv.find((a) => a.startsWith('--id=')) || '').slice(5) || null;

const escXml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function watermarkSvgLight(w, h, text) {
  const size = Math.max(22, Math.round(Math.min(w, h) / 16));
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><pattern id="wm" width="460" height="180" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)">` +
    `<text x="12" y="96" font-family="sans-serif" font-size="${size}" font-weight="bold" fill="white" fill-opacity="0.20">${escXml(text)}</text>` +
    `</pattern></defs><rect width="${w}" height="${h}" fill="url(#wm)"/></svg>`
  );
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query(
  `SELECT m.id, m.storage_key, m.event_id, m.preview_key, m.thumb_key, p.name AS photographer
   FROM media m LEFT JOIN photographers p ON p.id = m.photographer_id
   WHERE m.kind = 'reel' AND m.status <> 'archived' AND m.storage_key IS NOT NULL
   ${onlyId ? 'AND m.id = $1' : ''}`,
  onlyId ? [onlyId] : []
);
console.log(`reels: ${rows.length}`);

const { Readable } = await import('node:stream');
let done = 0;
for (const m of rows) {
  const label = `${m.id.slice(0, 8)} (${m.storage_key})`;
  if (DRY) { console.log(`WOULD FIX  ${label}`); continue; }
  const wmPath = path.join(os.tmpdir(), `eqindex-wm-${m.id}.png`);
  try {
    const s1 = await mediaStore.getStream(m.storage_key);
    const dims = await probeDims(s1.stream);
    const pvH = Math.max(2, Math.round((640 * dims.height) / Math.max(1, dims.width)));
    const wmPng = await sharp(watermarkSvgLight(640, pvH, `${m.photographer || 'EQINDEX'} • EQINDEX PREVIEW`)).png().toBuffer();
    await fs.promises.writeFile(wmPath, wmPng);
    try {
      const s2 = await mediaStore.getStream(m.storage_key);
      const preview = await renderPreview(s2.stream, wmPath);
      const s3 = await mediaStore.getStream(m.storage_key);
      const poster = await renderPoster(await streamToBuffer(s3.stream));
      await mediaStore.putBuffer(m.preview_key, preview.buffer, 'video/mp4');
      await mediaStore.putBuffer(m.thumb_key, poster, 'image/jpeg');
      done++;
      console.log(`FIXED  ${label} (preview ${(preview.buffer.length / 1048576).toFixed(1)}MB, poster ${(poster.length / 1024).toFixed(0)}KB)`);
    } finally {
      await fs.promises.unlink(wmPath).catch(() => {});
    }
  } catch (e) {
    console.error(`FAIL  ${label}: ${e.message}`);
  }
}
console.log(DRY ? 'dry run' : `done: ${done}/${rows.length} regenerated`);
await pool.end();
