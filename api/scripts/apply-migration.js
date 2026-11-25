// Applies one file from db/migrations in a single transaction.
//   node scripts/apply-migration.js 110_merch_catalog.sql
// --rollback applies the matching undo file from db/rollback instead:
//   node scripts/apply-migration.js --rollback 117_import_batches.sql
// Uses DATABASE_URL from api/.env. There is no migration tracking table:
// only run migrations written to be safe to re-run (IF NOT EXISTS, ON CONFLICT).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const rollback = process.argv[2] === '--rollback';
const name = path.basename(String(process.argv[rollback ? 3 : 2] || ''));
const file = path.join(__dirname, '../../db', rollback ? 'rollback' : 'migrations', name);
if (!/^\d+_[a-z0-9_]+\.sql$/.test(name) || !fs.existsSync(file)) {
  console.error('usage: node scripts/apply-migration.js [--rollback] <NNN_name.sql from db/migrations or db/rollback>');
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
    console.log(`applied ${rollback ? 'rollback ' : ''}${name}`);
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
})().catch((e) => { console.error('FAILED, nothing changed:', e.message); process.exit(1); });
