// Import a downloaded Instagram reel through the SAME pipeline as
// POST /admin/media/:id/finalize (probe → watermarked teaser → poster),
// link it to a rider/horse/event, publish. Re-runnable per file:
//
//   node scripts/import-ig-reel.mjs /tmp/reelimport/reel.mp4 \
//     --rider="Sophie Scott" --event="" --moment="" --publish
//
// Horse/event resolve by exact name (case-insensitive); empty = leave null.
// Skips files already imported (matched by original byte size).
import 'dotenv/config';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const pg = require('pg');
const sharp = require('sharp');
const mediaStore = require('../src/lib/mediaStore.js');
const { probeDims, renderPreview, renderPoster } = require('../src/lib/reelProcess.js');

const { Pool } = pg;

const escXml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Light reel variant (mirrors watermarkSvgLight in src/routes/media.js):
// wider-spaced, smaller, fainter tiles.
function watermarkSvg(w, h, text) {
  const size = Math.max(22, Math.round(Math.min(w, h) / 16));
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><pattern id="wm" width="460" height="180" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)">` +
    `<text x="12" y="96" font-family="sans-serif" font-size="${size}" font-weight="bold" fill="white" fill-opacity="0.20">${escXml(text)}</text>` +
    `</pattern></defs><rect width="${w}" height="${h}" fill="url(#wm)"/></svg>`
  );
}

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (k) => {
  const hit = args.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : '';
};
if (!file || !fs.existsSync(file)) throw new Error('usage: import-ig-reel.mjs <mp4> [--rider=] [--horse=] [--event=] [--publish]');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const { rows: [photographer] } = await pool.query(
  `SELECT id, name FROM photographers WHERE is_active ORDER BY created_at LIMIT 1`
);
if (!photographer) throw new Error('no active photographer');

async function resolveByName(table, name) {
  if (!name) return null;
  const { rows } = await pool.query(`SELECT id, name FROM ${table} WHERE LOWER(name) = LOWER($1) LIMIT 1`, [name]);
  if (!rows.length) { console.log(`WARN  ${table} "${name}" not found — leaving null`); return null; }
  return rows[0];
}

const buf = fs.readFileSync(file);

const rider = await resolveByName('riders', opt('rider'));
const horse = await resolveByName('horses', opt('horse'));
const event = await resolveByName('events', opt('event'));

const { rows: [row] } = await pool.query(
  `INSERT INTO media (photographer_id, event_id, horse_id, rider_id, kind, status)
   VALUES ($1,$2,$3,$4,'reel','draft') RETURNING id`,
  [photographer.id, event?.id || null, horse?.id || null, rider?.id || null]
);
const id = row.id;
try {
  const origKey = mediaStore.keyFor('originals', event?.id || null, id, 'mp4', photographer.name);
  await mediaStore.putBuffer(origKey, buf, 'video/mp4');

  // probeDims/renderPreview expect streams; feed a Readable instead.
  const { Readable } = await import('node:stream');
  const dims = await probeDims(Readable.from([buf]));
  const pvH = Math.max(2, Math.round((640 * dims.height) / Math.max(1, dims.width)));
  const wmPng = await sharp(watermarkSvg(640, pvH, `${photographer.name} • EQINDEX PREVIEW`)).png().toBuffer();
  const os = await import('node:os');
  const path = await import('node:path');
  const wmPath = path.join(os.tmpdir(), `eqindex-wm-${id}.png`);
  await fs.promises.writeFile(wmPath, wmPng);
  try {
    const preview = await renderPreview(Readable.from([buf]), wmPath);
    const poster = await renderPoster(preview.buffer);
    const thumbKey = mediaStore.keyFor('thumbs', event?.id || null, id, 'jpg', photographer.name);
    const previewKey = mediaStore.keyFor('previews', event?.id || null, id, 'mp4', photographer.name);
    await mediaStore.putBuffer(thumbKey, poster, 'image/jpeg');
    await mediaStore.putBuffer(previewKey, preview.buffer, 'video/mp4');
    await pool.query(
      `UPDATE media SET storage_key = $2, thumb_key = $3, preview_key = $4,
          width = $5, height = $6, status = $7 WHERE id = $1`,
      [id, origKey, thumbKey, previewKey, dims.width, dims.height, args.includes('--publish') ? 'published' : 'draft']
    );
  } finally {
    await fs.promises.unlink(wmPath).catch(() => {});
  }
  console.log(`SEED  reel ${id} (${(buf.length / 1048576).toFixed(1)}MB) rider=${rider?.name || '-'} event=${event?.name || '-'} status=${args.includes('--publish') ? 'published' : 'draft'}`);
} catch (e) {
  await pool.query(`UPDATE media SET status = 'archived' WHERE id = $1`, [id]);
  throw e;
} finally {
  await pool.end();
}
