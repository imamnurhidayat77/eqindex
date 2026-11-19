// Race + janitor tests against a running API (default http://localhost:3001).
// Usage: npm run test:race  (runs from api/)
// Covers: parallel same-key single/batch checkout (exactly one purchase set,
// no 500), expireHolds releasing a stale balance hold, and the 10-parallel
// unlock race the code comment at media.js credits/unlock claims (1 slot →
// exactly 1 win). Creates throwaway users/purchases/bundles and deletes them.
// Dev-only: resets the throttle buckets it burns so reruns are stable.
import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pg = require('pg');

const BASE = process.env.API_BASE || 'http://localhost:3001';
const ORIGIN = 'http://localhost:3000';
const stamp = Date.now().toString(36);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function publicPhoto() {
  const list = await (await fetch(`${BASE}/photos?limit=10`)).json().catch(() => ({}));
  return (list.data || []).find((x) => x.id);
}

async function post(path, body, { cookie = '', origin = ORIGIN } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  if (origin) headers.Origin = origin;
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

test('race: parallel same-key single checkout mints exactly one row', async () => {
  const photo = await publicPhoto();
  assert.ok(photo, 'need at least one public photo in dev DB');
  const key = `race1-${stamp}`;
  const email = `race1+${stamp}@example.com`;
  const body = { media_id: photo.id, email, idempotency_key: key };
  const [a, b] = await Promise.all([post('/api/checkout', body), post('/api/checkout', body)]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [200, 201], `expected one 201 + one 200-reused, got ${JSON.stringify(statuses)}`);
  const reused = [a, b].find((r) => r.status === 200);
  assert.equal(reused.json.data?.reused, true);
  const { rows } = await pool.query(
    `SELECT COUNT(*)::INT AS n FROM purchases WHERE idempotency_key = $1`, [key]);
  assert.equal(rows[0].n, 1, 'parallel double-submit must not mint two rows');
  await pool.query(`DELETE FROM purchases WHERE idempotency_key = $1`, [key]);
});

test('race: parallel same-key batch checkout mints one set, no 500', async () => {
  const photo = await publicPhoto();
  assert.ok(photo, 'need at least one public photo in dev DB');
  const key = `race2-${stamp}`;
  const email = `race2+${stamp}@example.com`;
  const body = { items: [{ media_id: photo.id }], email, idempotency_key: key };
  const [a, b] = await Promise.all([post('/api/checkout/batch', body), post('/api/checkout/batch', body)]);
  const statuses = [a.status, b.status].sort();
  assert.ok(statuses.includes(201), `expected a 201 winner, got ${JSON.stringify(statuses)}`);
  assert.ok(!statuses.includes(500), `parallel batch must never 500, got ${JSON.stringify(statuses)}`);
  const loser = [a, b].find((r) => r.status !== 201);
  assert.equal(loser.status, 409, `loser must get 409-pending, got ${loser.status}`);
  const { rows } = await pool.query(
    `SELECT COUNT(*)::INT AS n FROM purchases WHERE idempotency_key = $1`, [key]);
  assert.equal(rows[0].n, 1, 'parallel batch must not mint two sets');
  await pool.query(`DELETE FROM purchases WHERE idempotency_key = $1`, [key]);
});

test('janitor: expireHolds releases a stale balance hold', async (t) => {
  const { expireHolds } = require('./src/lib/wallet.js');
  const email = `race3+${stamp}@example.com`;
  const reg = await post('/auth/register', { name: 'Race Hold', email, password: 'testpass123', role: 'RIDER' });
  assert.equal(reg.status, 201, JSON.stringify(reg.json));
  const u = await pool.query(`SELECT id FROM users WHERE lower(email) = lower($1)`, [email]);
  const userId = u.rows[0].id;
  await pool.query(`UPDATE users SET balance_cents = 5000 WHERE id = $1`, [userId]);
  const photo = await publicPhoto();
  assert.ok(photo, 'need at least one public photo in dev DB');
  const key = `race3-${stamp}`;
  await pool.query(
    `INSERT INTO purchases (media_id, buyer_email, buyer_user_id, amount_cents, status, idempotency_key, balance_used_cents, created_at)
     VALUES ($1, $2, $3, 1000, 'pending', $4, 1000, NOW() - INTERVAL '25 hours')`,
    [photo.id, email, userId, key]);
  const n = await expireHolds(pool);
  assert.ok(n >= 1, 'expected the stale hold to be released');
  const p = await pool.query(`SELECT status FROM purchases WHERE idempotency_key = $1`, [key]);
  assert.equal(p.rows[0].status, 'cancelled');
  const bal = await pool.query(`SELECT balance_cents FROM users WHERE id = $1`, [userId]);
  assert.equal(Number(bal.rows[0].balance_cents), 6000, 'hold must be returned to balance');
  const tx = await pool.query(
    `SELECT COUNT(*)::INT AS n FROM wallet_transactions WHERE user_id = $1 AND kind = 'refund'`, [userId]);
  assert.ok(tx.rows[0].n >= 1, 'expected a refund ledger row with a reason');
  await pool.query(`DELETE FROM wallet_transactions WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM purchases WHERE idempotency_key = $1`, [key]);
  t.after(() => pool.query(`DELETE FROM rate_limits WHERE bucket IN ('checkout')`).catch(() => {}));
});

test('race: 10 parallel unlocks on 1 slot → exactly 1 win', async (t) => {
  const pack = await pool.query(
    `SELECT id, scope_type FROM credit_packs WHERE status = 'published' LIMIT 1`);
  if (!pack.rows.length) { t.skip('no published credit pack in dev DB'); return; }
  const { scope_type } = pack.rows[0];
  const subjCol = scope_type === 'horse' ? 'horse_id' : 'rider_id';
  // Packs are global (event_id NULL); the bundle takes the photo's event.
  const m = await pool.query(
    `SELECT id, event_id, rider_id, horse_id FROM media WHERE status = 'published' AND kind = 'photo'
      AND event_id IS NOT NULL AND ${subjCol} IS NOT NULL LIMIT 1`);
  if (!m.rows.length) { t.skip('no published photo matching the pack scope in dev DB'); return; }
  const media = m.rows[0];
  const event_id = media.event_id;
  const email = `race4+${stamp}@example.com`;
  let cookie = '';
  const regRes = await fetch(`${BASE}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ name: 'Race Unlock', email, password: 'testpass123', role: 'RIDER' }),
  });
  assert.equal(regRes.status, 201);
  const setCookie = regRes.headers.get('set-cookie') || '';
  const sess = /eq_session=([^;]+)/.exec(setCookie);
  assert.ok(sess, 'expected session cookie');
  cookie = `eq_session=${sess[1]}`;
  const u = await pool.query(`SELECT id FROM users WHERE lower(email) = lower($1)`, [email]);
  const userId = u.rows[0].id;
  const subjectId = scope_type === 'horse' ? media.horse_id : media.rider_id;
  const b = await pool.query(
    `INSERT INTO credit_bundles (pack_id, event_id, ${subjCol}, buyer_user_id, buyer_email, slots_total, status)
     VALUES ($1, $2, $3, $4, $5, 1, 'active') RETURNING id`,
    [pack.rows[0].id, event_id, subjectId, userId, email]);
  const bundleId = b.rows[0].id;
  const results = await Promise.all(
    Array.from({ length: 10 }, () => post('/api/credits/unlock', { media_id: media.id }, { cookie })));
  const statuses = results.map((r) => r.status);
  const wins = statuses.filter((s) => s === 201);
  assert.equal(wins.length, 1, `expected exactly 1 win, got ${JSON.stringify(statuses)}`);
  assert.ok(statuses.every((s) => [200, 201, 409].includes(s)), `no 429/500 allowed, got ${JSON.stringify(statuses)}`);
  const { rows } = await pool.query(
    `SELECT COUNT(*)::INT AS n FROM credit_redemptions WHERE bundle_id = $1`, [bundleId]);
  assert.equal(rows[0].n, 1, 'exactly one redemption may exist');
  await pool.query(`DELETE FROM credit_redemptions WHERE bundle_id = $1`, [bundleId]);
  await pool.query(`DELETE FROM credit_bundles WHERE id = $1`, [bundleId]);
  t.after(() => pool.query(`DELETE FROM rate_limits WHERE bucket IN ('credit-unlock')`).catch(() => {}));
});

test('cleanup: reset throttle + close pool', async () => {
  // Dev-only: reset the buckets this file burned so reruns are stable.
  await pool.query(`DELETE FROM rate_limits WHERE bucket IN ('checkout', 'credit-unlock')`).catch(() => {});
  await pool.end();
});
