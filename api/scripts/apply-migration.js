// Applies one file from db/migrations in a single transaction.
//   node scripts/apply-migration.js 110_merch_catalog.sql
// Uses DATABASE_URL from api/.env. There is no migration tracking table:
// only run migrations written to be safe to re-run (IF NOT EXISTS, ON CONFLICT).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const name = path.basename(String(process.argv[2] || ''));
const file = path.join(__dirname, '../../db/migrations', name);
if (!/^\d+_[a-z0-9_]+\.sql$/.test(name) || !fs.existsSync(file)) {
  console.error('usage: node scripts/apply-migration.js <NNN_name.sql from db/migrations>');
  process.exit(1);
}

(async () => {
  const url = process.env.DATABASE_URL;
  const c = new Client({ connectionString: url, ssl: url.includes('supabase') ? { rejectUnauthorized: false } : undefined });
  await c.connect();
  try {
    await c.query('BEGIN');
    await c.query(fs.readFileSync(file, 'utf8'));
    await c.query('COMMIT');
    console.log(`applied ${name}`);
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
})().catch((e) => { console.error('FAILED, nothing changed:', e.message); process.exit(1); });
