// Unit: merch order input checks and the shared pricing copy (no DB).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { parseOrderInput } = require('./src/routes/merch.js');
const m = { ...(await import('./src/lib/merch/merch.mjs')), ...(await import('./src/lib/merch/merch-config.mjs')) };

const LOGO = '11111111-1111-4111-8111-111111111111';
const good = () => ({
  productId: 'jacket', color: '#101418',
  lines: [{ size: 'M', qty: 3 }, { size: 'L', qty: 2 }],
  slots: { 'chest-left': 'club:demo-club', back: LOGO },
  slotShift: { back: { x: 999, y: -2, r: 15, f: 1 } },
  slotZoom: { back: 500 },
  contact: { name: 'Sam Rider', email: 'Sam@Example.com', phone: '+64 21 123 4567', club: 'Demo Club' },
  delivery: 'courier', address: { line1: '1 Arena Road', city: 'Hamilton', postcode: '3200' },
});

test('a valid order parses, clamps placement and lowercases the email', () => {
  const { values, errors } = parseOrderInput(good(), m);
  assert.deepEqual(errors, []);
  assert.equal(values.contact.email, 'sam@example.com');
  assert.deepEqual(values.sponsorLogoIds, [LOGO]);
  assert.equal(values.slotShift.back.x, m.SHIFT_MAX);
  assert.equal(values.slotZoom.back, 125);
  assert.equal(values.lines.reduce((n, l) => n + l.qty, 0), 5);
});

test('rejects unknown product, sizes, slots, bad qty and duplicate sizes', () => {
  assert.deepEqual(parseOrderInput({ ...good(), productId: 'boat' }, m).errors, ['unknown product']);
  const { errors } = parseOrderInput({
    ...good(),
    lines: [{ size: 'XXXL', qty: 1 }, { size: 'M', qty: 0 }, { size: 'L', qty: 1 }, { size: 'L', qty: 2 }],
    slots: { forehead: LOGO, back: 'javascript:alert(1)' },
  }, m);
  assert.ok(errors.some((e) => e.includes('XXXL')));
  assert.ok(errors.some((e) => e.startsWith('quantity for M')));
  assert.ok(errors.some((e) => e.includes('listed twice')));
  assert.ok(errors.some((e) => e.includes('unknown logo slot forehead')));
  assert.ok(errors.some((e) => e.includes('bad logo in back')));
});

test('courier needs a NZ address, pickup needs a club', () => {
  const noAddr = parseOrderInput({ ...good(), address: { line1: '', city: '', postcode: '12' } }, m).errors;
  assert.ok(noAddr.includes('NZ postcode must be 4 digits'));
  assert.ok(noAddr.includes('street address is required'));
  const pickup = parseOrderInput({ ...good(), delivery: 'pickup', contact: { ...good().contact, club: '' } }, m).errors;
  assert.ok(pickup.includes('club name is required for club pickup'));
  assert.ok(parseOrderInput({ ...good(), delivery: 'drone' }, m).errors.includes('choose courier or club pickup'));
});

test('an uploaded logo needs its secret key', () => {
  const id = '22222222-2222-4222-8222-222222222222';
  const withoutKey = parseOrderInput({ ...good(), slots: { back: `mlogo:${id}` } }, m).errors;
  assert.ok(withoutKey.some((e) => e.includes('missing its key')));
  const withKey = parseOrderInput({ ...good(), slots: { back: `mlogo:${id}` }, uploads: [{ id, secret: 'abc' }] }, m);
  assert.deepEqual(withKey.errors, []);
  assert.deepEqual(withKey.values.uploadIds, [id]);
});

test('uploaded artwork prices as an upload, not as a sponsor', () => {
  const q = m.quoteMerch('jacket', { back: 'mlogo:22222222-2222-4222-8222-222222222222' }, { strict: true });
  assert.equal(q.customCount, 1);
  assert.equal(q.discountCents, 0);
});

test('pricing copy is identical to the web designer', { skip: !existsSync(join(root, '../web-bossmedia/lib/merch.mjs')) }, () => {
  for (const f of ['merch.mjs', 'merch-config.mjs']) {
    assert.equal(
      readFileSync(join(root, 'src/lib/merch', f), 'utf8'),
      readFileSync(join(root, '../web-bossmedia/lib', f), 'utf8'),
      `${f} drifted: copy web-bossmedia/lib/${f} to api/src/lib/merch/`,
    );
  }
});

test('migration 108 creates the order tables', () => {
  const sql = readFileSync(join(root, '../db/migrations/108_merch_orders.sql'), 'utf8');
  for (const t of ['merch_orders', 'merch_order_lines', 'merch_order_logos', 'merch_order_events']) {
    assert.ok(sql.includes(`CREATE TABLE IF NOT EXISTS ${t} (`), t);
  }
});

test('a saved account logo (my:) is collected for the owner check and never discounted', () => {
  const id = '33333333-3333-4333-8333-333333333333';
  const { values, errors } = parseOrderInput({ ...good(), slots: { 'chest-left': `my:${id}` } }, m);
  assert.deepEqual(errors, []);
  assert.deepEqual(values.personalLogoIds, [id]);
  assert.deepEqual(values.sponsorLogoIds, []);
  assert.ok(parseOrderInput({ ...good(), slots: { back: 'my:nope' } }, m).errors.some((e) => e.includes('bad saved logo')));
  const q = m.quoteMerch('jacket', { 'chest-left': `my:${id}` }, { strict: true });
  assert.equal(q.discountCents, 0);
  assert.equal(m.LOGO_URL(`my:${id}`), `/merch-logo/${id}`);
});

test('a hidden product cannot be ordered', () => {
  m.setMerchCatalog([{ id: 'jacket', data: { ...m.merchProductData(m.merchProduct('jacket')), status: 'hidden' } }]);
  assert.deepEqual(parseOrderInput(good(), m).errors, ['this product is no longer available']);
  m.setMerchCatalog([]);
  assert.deepEqual(parseOrderInput(good(), m).errors, []);
});

test('migration 110 seeds exactly the built-in catalog', () => {
  const sql = readFileSync(join(root, '../db/migrations/110_merch_catalog.sql'), 'utf8');
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS merch_products ('));
  assert.ok(sql.includes('ON CONFLICT (id) DO NOTHING'));
  const rows = [...sql.matchAll(/\('([a-z0-9-]+)', '(.*)'::JSONB\)/g)].map(([, id, json]) => ({ id, data: JSON.parse(json.replace(/''/g, "'")) }));
  m.setMerchCatalog([]);
  const builtin = m.merchProducts({ all: true });
  assert.deepEqual(rows.map((r) => r.id), builtin.map((p) => p.id));
  // Seeded rows (written before products had a model) load as the built-ins.
  assert.deepEqual(m.setMerchCatalog(rows), []);
  assert.deepEqual(m.merchProducts({ all: true }), builtin);
  m.setMerchCatalog([]);
});

test('an order for a new product on a built-in model parses with that model\'s slots', () => {
  const d = m.newMerchProductDraft('club-softshell', 'jacket');
  m.setMerchCatalog([{ id: 'club-softshell', data: { ...d, status: 'active' } }]);
  const { values, errors } = parseOrderInput({ ...good(), productId: 'club-softshell' }, m);
  assert.deepEqual(errors, []);
  assert.equal(values.product.model, 'jacket');
  m.setMerchCatalog([]);
});

test('proof answer: approve, or changes with a note', () => {
  const { parseProofResponse, canSendProof } = require('./src/routes/merch.js');
  assert.deepEqual(parseProofResponse({ decision: 'approve' }), { decision: 'approved', note: null });
  assert.equal(parseProofResponse({ decision: 'changes', note: ' ' }).error, 'tell us what to change');
  assert.equal(parseProofResponse({ decision: 'changes', note: 'Make the back logo bigger' }).decision, 'changes_requested');
  assert.equal(parseProofResponse({ decision: 'paid' }).error, 'choose approve or request changes');
  assert.equal(parseProofResponse({ decision: 'changes', note: 'x'.repeat(5000) }).note.length, 1000);
  assert.ok(canSendProof('changes_requested') && canSendProof('proof_sent'));
  assert.ok(!canSendProof('approved') && !canSendProof('paid'));
});

test('order link tokens: buyer token and mail token open only their order', async () => {
  const { tokenOpens, mailToken } = require('./src/routes/merch.js');
  const { createHash } = await import('node:crypto');
  const hash = (v) => createHash('sha256').update(v).digest('hex');
  const a = { ref: 'BM-AAAAAA', access_hash: hash('buyer-secret-a') };
  const b = { ref: 'BM-BBBBBB', access_hash: hash('buyer-secret-b') };
  assert.ok(tokenOpens(a, 'buyer-secret-a'));
  assert.ok(tokenOpens(a, mailToken(a)));
  assert.ok(!tokenOpens(a, mailToken(b)));
  assert.ok(!tokenOpens(a, 'buyer-secret-b'));
  assert.ok(!tokenOpens(a, ''));
  assert.ok(!tokenOpens(a, a.access_hash), 'the stored hash itself is not a token');
});

test('sponsor discount on a big order never passes the budget left', () => {
  const { perItemSponsorCaps, splitSponsorDiscount } = require('./src/routes/merch.js');
  const S1 = '33333333-3333-4333-8333-333333333333';
  const S2 = '44444444-4444-4444-8444-444444444444';
  const funded = {
    [LOGO]: { sponsor_id: S1, budget_id: 'b1', discount_cents: 1000, left_cents: 3000 },
    [S2]: { sponsor_id: S2, budget_id: 'b2', discount_cents: 500, left_cents: 100000 },
  };
  const slots = { back: LOGO, 'chest-left': S2 };
  const caps = perItemSponsorCaps(slots, funded, 20, true);
  assert.deepEqual(caps, { [S1]: 150, [S2]: 5000 });
  assert.equal(perItemSponsorCaps({ back: LOGO, 'chest-left': LOGO }, funded, 20, false)[S1], 75, 'two slots share the budget');

  const lines = [{ size: 'M', qty: 20 }];
  const settings = m.merchOrderSettings({ sponsorCapCents: 1000000, maxDiscountPct: 90 });
  const quote = m.quoteMerchOrder('jacket', slots, lines, {
    strict: true,
    discountFor: (id) => Math.min(funded[id].discount_cents, caps[funded[id].sponsor_id]),
    sponsorOf: (id) => funded[id]?.sponsor_id || id,
  }, 'courier', settings);
  const split = splitSponsorDiscount(quote, slots, (id) => funded[id]?.sponsor_id);
  assert.ok(split[S1] <= 3000, `sponsor 1 holds ${split[S1]}, budget left 3000`);
  assert.equal(split[S1] + split[S2], quote.discountCents, 'parts sum to the order discount');
});

test('splitting a capped discount keeps exact cents', () => {
  const { splitSponsorDiscount } = require('./src/routes/merch.js');
  const quote = { discountCents: 100, item: { lines: [
    { kind: 'sponsor', slot: 'a', cents: -1000 }, { kind: 'sponsor', slot: 'b', cents: -1000 }, { kind: 'sponsor', slot: 'c', cents: -1000 },
  ] } };
  const split = splitSponsorDiscount(quote, { a: 'x', b: 'y', c: 'z' }, (v) => v);
  assert.equal(split.x + split.y + split.z, 100);
  assert.ok(Object.values(split).every((c) => c === 33 || c === 34));
  assert.deepEqual(splitSponsorDiscount({ discountCents: 0, item: { lines: [] } }, {}, (v) => v), {});
});

test('fulfilment moves one step at a time', () => {
  const { parseFulfilment } = require('./src/routes/merch.js');
  assert.deepEqual(parseFulfilment('paid', { status: 'in_production' }), { to: 'in_production', note: null });
  assert.equal(parseFulfilment('in_production', { status: 'shipped', note: ' NZ Post AB123 ' }).note, 'NZ Post AB123');
  assert.ok(parseFulfilment('approved', { status: 'in_production' }).error, 'unpaid orders never go to production');
  assert.ok(parseFulfilment('paid', { status: 'delivered' }).error, 'no skipping steps');
  assert.ok(parseFulfilment('delivered', { status: 'shipped' }).error, 'no going back');
});

