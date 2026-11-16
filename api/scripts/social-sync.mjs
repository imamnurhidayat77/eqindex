// Nightly: pull insights for posts made from BossMedia (IG full, FB summary).
// Meta data can lag ~48h — an empty result means "not yet", not zero.
//   node scripts/social-sync.mjs [--dry]
import 'dotenv/config';
import pg from 'pg';
import insights from '../src/lib/socialInsights.js';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const DRY = process.argv.includes('--dry');

const { rows: posts } = await pool.query(
  `SELECT sp.id, sp.provider, sp.remote_media_id, sa.enc_token FROM social_posts sp
   JOIN social_accounts sa ON sa.user_id = sp.user_id AND sa.provider = sp.provider
   WHERE sp.status = 'published' AND sp.posted_at > NOW() - INTERVAL '90 days'
   ORDER BY sp.posted_at DESC LIMIT 200`);

let ok = 0, failed = 0;
for (const p of posts) {
  try {
    if (DRY) { ok++; continue; }
    await insights.syncPost(pool, p, insights.decryptToken(p.enc_token));
    ok++;
  } catch (e) { failed++; console.error('[social-sync]', p.id, e.message); }
}
console.log(`[social-sync] ok=${ok} failed=${failed}${DRY ? ' (dry)' : ''}`);
await pool.end();
