// Security audit fixes 2026-11-25 (C1, H1-H4). No DB needed: storage
// routing and the CSRF guard run for real, the route guards are checked
// in source like roles.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const src = (p) => readFileSync(join(root, p), 'utf8');

test('C1: only previews and thumbs go to the public bucket', () => {
  Object.assign(process.env, {
    R2_ENDPOINT: 'https://r2.test', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's',
    R2_BUCKET: 'public-bucket', R2_PRIVATE_BUCKET: 'private-bucket',
  });
  const { bucketFor, isPublicKey } = require('./src/lib/mediaStore.js');
  for (const k of ['boss-media/previews/ev/m.jpg', 'thumbs/ev/m.jpg']) {
    assert.ok(isPublicKey(k), k);
    assert.equal(bucketFor(k), 'public-bucket', k);
  }
  for (const k of ['boss-media/originals/ev/m.jpg', 'originals/ev/m.jpg', 'logos/p.jpg',
    'boss-media/branded/ev/m.mp4', 'sponsors/s/l.png', 'merch/logos/x.png', 'merch/proofs/o/1.jpg',
    'previews/m.jpg', '']) {
    assert.equal(bucketFor(k), 'private-bucket', k);
  }
});

async function csrfStatus(headers) {
  process.env.NODE_ENV = 'production';
  process.env.WEB_ORIGIN = 'https://bossmedia.test';
  const express = require('express');
  const { applySecurity } = require('./src/middleware/security.js');
  const app = express();
  applySecurity(app);
  app.post('/auth/mfa/setup', (req, res) => res.json({ reached: true }));
  const srv = await new Promise((ok) => { const s = app.listen(0, () => ok(s)); });
  try {
    const r = await fetch(`http://127.0.0.1:${srv.address().port}/auth/mfa/setup`, {
      method: 'POST', body: 'a=1',
      headers: { Cookie: 'eq_session=x', 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    });
    return r.status;
  } finally {
    srv.close();
  }
}

test('H3: CSRF guard refuses Origin null and cross-site browsers', async () => {
  assert.equal(await csrfStatus({ Origin: 'null' }), 403);
  assert.equal(await csrfStatus({ Origin: 'https://evil.test' }), 403);
  assert.equal(await csrfStatus({ 'Sec-Fetch-Site': 'cross-site' }), 403);
  assert.equal(await csrfStatus({ Origin: 'https://bossmedia.test' }), 200);
  assert.equal(await csrfStatus({}), 200); // curl / scripts
});

test('H1: platform-wide settings are ADMIN only', () => {
  const media = src('src/routes/media.js');
  assert.match(media, /const ADMIN_ONLY_SETTINGS = SETTING_KEYS;/);
  assert.match(media, /ADMIN_ONLY_SETTINGS\.includes\(key\) && req\.authUser\.role !== 'ADMIN'/);
});

test('H2: packages and credit packs are scoped to their photographer', () => {
  const media = src('src/routes/media.js');
  assert.ok(media.includes("ownsPricingRow('packages'"), 'package delete checks owner');
  assert.ok(media.includes("ownsPricingRow('credit_packs'"), 'credit pack delete checks owner');
  assert.equal((media.match(/::UUID IS NULL OR photographer_id = \$\$\{vals\.length\}/g) || []).length, 2,
    'package + credit pack PATCH carry the owner condition');
  assert.equal((media.match(/OR m\.photographer_id = \$[23]\)/g) || []).length, 2, 'bundle items are own photos');
  assert.ok(media.includes("if (!eventId && req.authUser.role !== 'ADMIN')"), 'global packs are ADMIN only');
  assert.ok(media.includes('AND (cp.event_id IS NULL OR cp.photographer_id = $5)'), 'unlock matches the pack photographer');
});

test('H4: MFA setup cannot replace a working secret', () => {
  const auth = src('src/routes/auth.js');
  const setup = auth.slice(auth.indexOf("app.post('/auth/mfa/setup'"), auth.indexOf("app.get('/auth/mfa/status'"));
  assert.ok(setup.indexOf('totp_verified_at') < setup.indexOf('generateSecret'), 'checks before minting');
  assert.match(setup, /status\(409\)/);
});

test('M8: platform only absorbs the discount no budget funds', () => {
  const { platformFeeAfterDiscount, computeSplit } = require('./src/lib/wallet.js');
  const split = computeSplit(10000, 0.1, 0.1, true); // 8000 / 1000 / 1000
  // Fully funded 3000 discount: sponsor pays it, platform keeps its 10%.
  assert.equal(platformFeeAfterDiscount(10000, split, 3000, 3000), 1000);
  // Budget only had 1000 left: platform absorbs the other 2000, never below that.
  assert.equal(platformFeeAfterDiscount(10000, split, 3000, 1000), -1000);
  // No sponsor at all.
  assert.equal(platformFeeAfterDiscount(10000, split, 0, 0), 1000);
});

test('M8: checkout reserves the discount under a budget lock', async () => {
  const { reserveSponsorDiscounts } = require('./src/lib/wallet.js');
  const calls = [];
  const client = (left) => ({
    query: async (sql, params) => {
      calls.push([sql, params[0]]);
      return /left_cents/.test(sql) ? { rows: [{ left_cents: left }] } : { rows: [{ id: params[0] }] };
    },
  });
  const items = [
    { budgetId: 'b2', originalCents: 1000, amount: 700 },
    { budgetId: 'b1', originalCents: 1000, amount: 800 },
    { budgetId: 'b2', originalCents: 1000, amount: 700 },
    { budgetId: null, originalCents: null, amount: 500 },
  ];
  await reserveSponsorDiscounts(client(600), items); // b2 needs exactly 600
  assert.deepEqual(calls.filter((c) => c[0].includes('FOR UPDATE')).map((c) => c[1]), ['b1', 'b2'], 'locks in id order');
  await assert.rejects(reserveSponsorDiscounts(client(599), items), (e) => e.status === 409);
  const media = src('src/routes/media.js');
  assert.equal((media.match(/await reserveSponsorDiscounts\(client, /g) || []).length, 5, 'every checkout path reserves');
  assert.ok(!media.includes('(b.agreed_cents - b.spent_cents) >= b.discount_cents'), 'budget pick counts open holds');
});

test('M7: a refund or chargeback undoes the money it paid out', () => {
  const { planReversal } = require('./src/lib/wallet.js');
  // Organizer still holds its 1000 share, unbilled 3000 discount, buyer used 500 wallet.
  assert.deepEqual(planReversal({ organizerPayout: 1000, organizerBalance: 5000, balanceUsed: 500,
    redemption: { discount_cents: 3000, bill_id: null }, returnBalance: true }),
  { organizerDebit: 1000, organizerShortfall: 0, sponsorRelease: 3000, sponsorBilled: 0, buyerCredit: 500 });
  // Chargeback: organizer already spent most of it, sponsor already billed, buyer keeps nothing extra.
  assert.deepEqual(planReversal({ organizerPayout: 1000, organizerBalance: 300, balanceUsed: 500,
    redemption: { discount_cents: 3000, bill_id: 'bill' }, returnBalance: false }),
  { organizerDebit: 300, organizerShortfall: 700, sponsorRelease: 0, sponsorBilled: 3000, buyerCredit: 0 });
  // Wallet balance can never go negative.
  assert.equal(planReversal({ organizerPayout: 1000, organizerBalance: -5 }).organizerDebit, 0);

  const media = src('src/routes/media.js');
  assert.ok(media.includes("event.type === 'charge.dispute.created'"), 'disputes are handled');
  assert.equal((media.match(/await revokePayment\(req, /g) || []).length, 2, 'refund + dispute share one path');
  assert.ok(media.includes('await reversePurchase(pool, id, { reason, returnBalance })'), 'every revoked purchase is reversed');
});

test('H5: merch sponsor holds need an account and can be cancelled', () => {
  const { canCancel, MAX_OPEN_SPONSOR_ORDERS } = require('./src/routes/merch.js');
  for (const st of ['submitted', 'artwork_review', 'changes_requested', 'proof_sent']) {
    assert.ok(canCancel(st, false), `buyer cancels ${st}`);
    assert.ok(canCancel(st, true), `admin cancels ${st}`);
  }
  assert.ok(!canCancel('approved', false), 'buyer cannot cancel once a Stripe page may be open');
  assert.ok(canCancel('approved', true), 'admin can cancel an unpaid approved order');
  for (const st of ['paid', 'in_production', 'shipped', 'delivered', 'cancelled', 'refunded']) {
    assert.ok(!canCancel(st, true), `${st} is never cancelled`);
  }
  assert.equal(MAX_OPEN_SPONSOR_ORDERS, 3);
  const merch = src('src/routes/merch.js');
  assert.ok(merch.includes("v.sponsorLogoIds.length && !req.authUser"), 'anonymous sponsor discount refused');
  assert.ok(merch.includes("UPDATE merch_sponsor_holds SET status = 'released', updated_at = NOW() WHERE order_id = $1 AND status = 'held'"), 'cancel releases holds');
  assert.ok(merch.includes("app.post('/api/merch/orders/:ref/cancel'") && merch.includes("app.post('/admin/merch/orders/:ref/cancel', needRole('ADMIN')"));
});
