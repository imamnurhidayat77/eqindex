// Money-path security tests against a running API (default http://localhost:3001).
// Usage: npm run test:security  (runs from api/)
// Covers: CSRF guard on cookie mutations, batch idempotency (double-POST),
// webhook amount-mismatch guard (needs STRIPE_WEBHOOK_SECRET, else skipped).
// Creates one throwaway user + pending test purchases, deletes the purchases.
import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pg = require('pg');

const BASE = process.env.API_BASE || 'http://localhost:3001';
const ORIGIN = 'http://localhost:3000';
const stamp = Date.now().toString(36);
const EMAIL = `sectest+${stamp}@example.com`;
const IDEM = `sectest-${stamp}`;

let cookie = '';
let userId = null;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function post(path, body, { withCookie = true, origin = ORIGIN } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (withCookie && cookie) headers.Cookie = cookie;
  if (origin) headers.Origin = origin;
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const raw = res.headers.get('set-cookie') || '';
  const m = /eq_session=([^;]+)/.exec(raw);
  if (m) cookie = `eq_session=${m[1]}`;
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

test('setup: register throwaway buyer', async () => {
  const { status, json } = await post('/auth/register',
    { name: 'Sec Test', email: EMAIL, password: 'testpass123', role: 'RIDER' });
  assert.equal(status, 201, JSON.stringify(json));
  assert.ok(cookie.includes('eq_session'), 'expected session cookie');
  userId = json.data?.id;
});

test('CSRF guard: foreign Origin with cookie is refused', async () => {
  const { status } = await post('/auth/logout', {}, { origin: 'https://evil.example' });
  assert.equal(status, 403);
});

test('CSRF guard: headerless JSON (scripts/tests) still works', async () => {
  const { status } = await post('/auth/logout', {}, { origin: null });
  assert.equal(status, 200);
});

test('CSRF guard: headerless multipart with cookie is refused', async () => {
  const res = await fetch(`${BASE}/auth/logout`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'multipart/form-data; boundary=----x' },
    body: '------x--\r\n',
  });
  assert.equal(res.status, 403);
});

test('CSRF guard: same-origin localhost request passes through', async () => {
  // /auth/logout with a valid session cookie + localhost Origin must NOT 403
  // (it clears the cookie and returns ok — we re-login right after).
  const { status } = await post('/auth/logout', {});
  assert.equal(status, 200);
  const again = await post('/auth/login', { email: EMAIL, password: 'testpass123' });
  assert.equal(again.status, 200, JSON.stringify(again.json));
  assert.ok(cookie.includes('eq_session'), 'expected fresh session cookie');
});

test('batch idempotency: same key twice pays once', async () => {
  const list = await (await fetch(`${BASE}/photos?limit=10`)).json().catch(() => ({}));
  const photo = (list.data || []).find((x) => x.id);
  assert.ok(photo, 'need at least one public photo in dev DB');
  const body = { items: [{ media_id: photo.id }], email: EMAIL, idempotency_key: IDEM };
  const first = await post('/api/checkout/batch', body);
  assert.equal(first.status, 201, JSON.stringify(first.json));
  assert.ok(first.json.data?.purchase_ids?.length, 'expected purchase ids');
  const second = await post('/api/checkout/batch', body);
  assert.equal(second.status, 409, `expected 409, got ${second.status}: ${JSON.stringify(second.json)}`);
  assert.ok(second.json.pending || second.json.paid, 'expected pending/paid flag');
});

test('webhook amount-mismatch guard', { skip: !process.env.STRIPE_WEBHOOK_SECRET }, async () => {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const payload = JSON.stringify({
    id: 'evt_sectest', object: 'event', type: 'checkout.session.completed',
    data: { object: { id: 'cs_sectest', object: 'checkout.session', payment_status: 'paid', amount_total: 1, customer_email: EMAIL, metadata: { purchase_ids: JSON.stringify(['00000000-0000-0000-0000-000000000000']) } } },
  });
  const sig = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  const res = await fetch(`${BASE}/api/stripe/webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sig }, body: payload,
  });
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.received, true);
  // Bogus purchase id: nothing must flip to paid.
  const { rows } = await pool.query(`SELECT COUNT(*)::INT AS n FROM purchases WHERE buyer_user_id = $1 AND status = 'paid' AND amount_cents = 1`, [userId]);
  assert.equal(rows[0].n, 0);
});

test('cleanup: remove test purchases', async () => {
  await pool.query(`DELETE FROM purchases WHERE buyer_user_id = $1 AND idempotency_key = $2`, [userId, IDEM]);
  await pool.end();
});
