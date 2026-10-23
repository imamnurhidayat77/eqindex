// Real R2 upload for demo mock photos: download the Figma/Unsplash set,
// run it through the SAME pipeline as POST /admin/media/upload
// (original + 480px thumb + 1024px watermarked preview), link each row to a
// real event + horse + rider, publish. Re-runnable: wipes previous mock rows
// (thumb_key LIKE '%unsplash%') first so demo data stays at exactly
// EVENTS × PER_EVENT.
//
//   node scripts/seed-mock-photos-r2.mjs [--events=4] [--per-event=6] [--dry]
import 'dotenv/config';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pg = require('pg');
const sharp = require('sharp');
const mediaStore = require('../src/lib/mediaStore.js');

const { Pool } = pg;

const IMAGES = [
  'https://images.unsplash.com/flagged/photo-1568382007362-5d0d0a26b422',
  'https://images.unsplash.com/photo-1511746687876-42cb762f6ac1',
  'https://images.unsplash.com/photo-1579113813543-fa41eb8bf556',
  'https://images.unsplash.com/photo-1594768816441-1dd241ffaa67',
  'https://images.unsplash.com/photo-1630224166142-38de0d17dfda',
  'https://images.unsplash.com/photo-1695133994806-20833ee9d4c2',
  'https://images.unsplash.com/photo-1695133996154-e09d82de12b9',
  'https://images.unsplash.com/photo-1698653223457-05e00ad9cec2',
  'https://images.unsplash.com/photo-1726209431921-71cb661b4dbf',
  'https://images.unsplash.com/photo-1726209451255-93951e0f4a46',
];
const sourceUrl = (base) => `${base}?auto=format&fit=crop&w=1600&q=90`;

const MOMENTS = [null, null, null, 'clear', 'win', 'debut', 'pb'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v);

// Same diagonal-tile watermark as POST /admin/media/upload.
const escXml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function watermarkSvg(w, h, text) {
  const size = Math.max(30, Math.round(Math.min(w, h) / 10));
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><pattern id="wm" width="260" height="100" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)">` +
    `<text x="8" y="52" font-family="sans-serif" font-size="${size}" font-weight="bold" fill="white" fill-opacity="0.36">${escXml(text)}</text>` +
    `</pattern></defs><rect width="${w}" height="${h}" fill="url(#wm)"/></svg>`
  );
}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, '').split('='))
);
const N_EVENTS = parseInt(args.events || '4', 10);
const PER_EVENT = parseInt(args['per-event'] || '6', 10);
const DRY = 'dry' in args;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const { rows: [photographer] } = await pool.query(
  `SELECT id, name FROM photographers WHERE is_active ORDER BY created_at LIMIT 1`
);
if (!photographer) throw new Error('no active photographer — seed one first');

if (!DRY) {
  const del = await pool.query(
    `DELETE FROM media WHERE thumb_key LIKE '%unsplash%' OR preview_key LIKE '%unsplash%'`
  );
  console.log(`cleared ${del.rowCount} previous URL-only mock rows`);
}

const { rows: events } = await pool.query(
  `SELECT id, name, date_start FROM events ORDER BY date_start DESC LIMIT $1`,
  [N_EVENTS]
);
const { rows: horses } = await pool.query(
  `SELECT id FROM horses WHERE COALESCE(photo_hidden, FALSE) = FALSE`
);
const { rows: riders } = await pool.query(
  `SELECT id FROM riders WHERE COALESCE(photo_hidden, FALSE) = FALSE`
);
console.log(`events=${events.length} horses=${horses.length} riders=${riders.length}`);

async function download(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'EQIndex-seed/1.0' } });
  if (!res.ok) throw new Error(`download ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

let done = 0;
for (const [ei, ev] of events.entries()) {
  const combos = shuffle(horses.flatMap((h) => riders.slice(0, 60).map((r) => [h.id, r.id])));
  const day = new Date(ev.date_start);
  for (let i = 0; i < PER_EVENT; i++) {
    const base = IMAGES[(ei * 3 + i) % IMAGES.length];
    const [horse_id, rider_id] = combos[i % combos.length];
    const taken = new Date(day);
    taken.setHours(9 + (i % 8), (i * 11) % 60, 0, 0);
    const label = `${ev.name} #${i + 1} (${base.split('/').pop().slice(0, 24)}…)`;
    if (DRY) { console.log(`DRY   ${label}`); continue; }

    const { rows: [row] } = await pool.query(
      `INSERT INTO media (photographer_id, event_id, horse_id, rider_id, kind,
          moment, license_default, taken_at, status)
       VALUES ($1,$2,$3,$4,'photo',$5,$6,$7,'published') RETURNING id`,
      [photographer.id, ev.id, horse_id, rider_id,
        pick(MOMENTS), Math.random() < 0.25 ? 'social' : 'web', taken.toISOString()]
    );
    const id = row.id;
    try {
      const buf = await download(sourceUrl(base));
      const meta = await sharp(buf).metadata();
      const origKey = mediaStore.keyFor('originals', ev.id, id, 'jpg', photographer.name);
      await mediaStore.putBuffer(origKey, buf, 'image/jpeg');
      const pvW = 1024;
      const pvH = Math.round(pvW * (meta.height || 1000) / (meta.width || 1600));
      const wm = watermarkSvg(pvW, pvH, `${photographer.name} • EQINDEX PREVIEW`);
      const thumbBuf = await sharp(buf).rotate().resize({ width: 480, withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
      const previewBuf = await sharp(buf).rotate().resize({ width: pvW, withoutEnlargement: true })
        .composite([{ input: wm, blend: 'over' }]).jpeg({ quality: 68 }).toBuffer();
      const thumbKey = mediaStore.keyFor('thumbs', ev.id, id, 'jpg', photographer.name);
      const previewKey = mediaStore.keyFor('previews', ev.id, id, 'jpg', photographer.name);
      await mediaStore.putBuffer(thumbKey, thumbBuf, 'image/jpeg');
      await mediaStore.putBuffer(previewKey, previewBuf, 'image/jpeg');
      await pool.query(
        `UPDATE media SET storage_key = $2, thumb_key = $3, preview_key = $4,
            width = $5, height = $6 WHERE id = $1`,
        [id, origKey, thumbKey, previewKey, meta.width || null, meta.height || null]
      );
      done++;
      console.log(`SEED  ${label} -> ${origKey}`);
    } catch (e) {
      await pool.query(`UPDATE media SET status = 'archived' WHERE id = $1`, [id]);
      console.error(`FAIL  ${label}: ${e.message}`);
    }
  }
}

console.log(DRY ? 'dry run — nothing written' : `done: ${done} R2-backed mock photos`);
await pool.end();
