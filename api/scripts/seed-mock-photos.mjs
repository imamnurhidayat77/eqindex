// Seed mock horse photos from the Figma/Unsplash set across several events.
// Mock rows store the full image URL directly in thumb_key/preview_key —
// api/src/lib/mediaStore.js publicUrlOrPassthrough() passes those through,
// so no R2 upload is needed. Safe to re-run: skips events that already have
// mock photos (tagged via taken_at note below... see IDEMPOTENT check).
//
//   node scripts/seed-mock-photos.mjs [--events=6] [--per-event=10] [--dry]
import 'dotenv/config';
import pg from 'pg';

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

const thumb = (base) => `${base}?auto=format&fit=crop&w=600&q=70`;
const preview = (base) => `${base}?auto=format&fit=crop&w=1200&q=85`;

const MOMENTS = [null, null, null, 'clear', 'win', 'debut', 'pb'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v);

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, '').split('='))
);
const N_EVENTS = parseInt(args.events || '6', 10);
const PER_EVENT = parseInt(args['per-event'] || '10', 10);
const DRY = 'dry' in args;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const { rows: [photographer] } = await pool.query(
  `SELECT id FROM photographers WHERE is_active ORDER BY created_at LIMIT 1`
);
if (!photographer) throw new Error('no active photographer — seed one first');

// Most recent events first (the ones visitors actually browse).
const { rows: events } = await pool.query(
  `SELECT id, name, date_start FROM events ORDER BY date_start DESC LIMIT $1`,
  [N_EVENTS]
);
if (!events.length) throw new Error('no events to seed into');

// Visible subjects only (photo_hidden opt-outs stay out of public browsing).
const { rows: horses } = await pool.query(
  `SELECT id FROM horses WHERE COALESCE(photo_hidden, FALSE) = FALSE`
);
const { rows: riders } = await pool.query(
  `SELECT id FROM riders WHERE COALESCE(photo_hidden, FALSE) = FALSE`
);
console.log(`events=${events.length} horses=${horses.length} riders=${riders.length}`);

let inserted = 0;
for (const ev of events) {
  // Idempotency: skip events that already have mock (unsplash) photos.
  const { rows: [existing] } = await pool.query(
    `SELECT COUNT(*)::INT AS n FROM media
      WHERE event_id = $1 AND status = 'published' AND thumb_key LIKE '%unsplash.com%'`,
    [ev.id]
  );
  if (existing.n > 0) {
    console.log(`SKIP  ${ev.name} (already has ${existing.n} mock photos)`);
    continue;
  }
  const combos = shuffle(
    horses.flatMap((h) => riders.slice(0, 60).map((r) => [h.id, r.id]))
  );
  const day = new Date(ev.date_start);
  const rows = [];
  for (let i = 0; i < PER_EVENT; i++) {
    const base = IMAGES[i % IMAGES.length];
    const [horse_id, rider_id] = combos[i % combos.length];
    const taken = new Date(day);
    taken.setHours(9 + (i % 8), (i * 7) % 60, 0, 0);
    rows.push([
      photographer.id, ev.id, horse_id, rider_id, 'photo',
      preview(base), thumb(base),
      pick(MOMENTS), Math.random() < 0.25 ? 'social' : 'web',
      taken.toISOString(),
    ]);
  }
  if (DRY) {
    console.log(`DRY   ${ev.name}: would insert ${rows.length} photos`);
    continue;
  }
  for (const r of rows) {
    await pool.query(
      `INSERT INTO media
        (photographer_id, event_id, horse_id, rider_id, kind,
         preview_key, thumb_key, moment, license_default, taken_at, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'published')`,
      r
    );
  }
  inserted += rows.length;
  console.log(`SEED  ${ev.name}: +${rows.length} photos`);
}

console.log(DRY ? 'dry run — nothing written' : `done: ${inserted} mock photos inserted`);
await pool.end();
