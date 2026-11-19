#!/usr/bin/env node
// Webhook rejection monitor — run from api/ (needs DATABASE_URL):
//   node scripts/audit-webhook-rejections.mjs [--hours=24]
// Prints stripe.webhook.rejected audit rows (amount_mismatch, email_mismatch,
// items_missing, bad_signature) and exits 1 when any exist, so cron/CI can
// alert. A repeated amount_mismatch is either an attack or a Stripe
// misconfiguration — both need a human.
import 'dotenv/config';
import pg from 'pg';

const hours = Number((process.argv.find((a) => a.startsWith('--hours=')) || '').split('=')[1]) || 24;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const { rows } = await pool.query(
    `SELECT created_at, actor, entity_id, detail FROM entity_audit
      WHERE action = 'stripe.webhook.rejected' AND created_at > NOW() - ($1 || ' hours')::INTERVAL
      ORDER BY created_at DESC LIMIT 100`,
    [String(hours)]);
  if (!rows.length) {
    console.log(`webhook rejections in the last ${hours}h: none`);
  } else {
    for (const r of rows) {
      console.log(`${r.created_at.toISOString()} session=${r.entity_id} ${JSON.stringify(r.detail)}`);
    }
    console.log(`\nwebhook rejections in the last ${hours}h: ${rows.length}`);
  }
  process.exitCode = rows.length ? 1 : 0;
} catch (e) {
  console.error(`audit query failed: ${e.message}`);
  process.exitCode = 2;
} finally {
  await pool.end();
}
