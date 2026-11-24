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
