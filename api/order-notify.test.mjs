// Unit: every transaction status has buyer and admin wording (no DB).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { merchCopy } = require('./src/lib/orderNotify.js');

const order = { ref: 'BM-ABC234', buyer_name: 'Sam Rider', product_id: 'jacket', quote: { product: { label: 'Jacket' } }, total_cents: 60000, delivery: 'courier' };
const STATUSES = ['submitted', 'proof_sent', 'approved', 'changes_requested', 'paid', 'in_production', 'shipped', 'delivered', 'cancelled', 'refunded'];

test('every merch status tells the buyer and the admins, with the order ref', () => {
  for (const s of STATUSES) {
    const c = merchCopy(order, s, null);
    for (const who of ['buyer', 'admin']) {
      assert.ok(c[who].title.endsWith('· BM-ABC234'), `${s} ${who} title`);
      assert.ok(c[who].body.length > 10 && !/undefined|NaN|null/.test(c[who].body), `${s} ${who} body`);
    }
  }
  assert.equal(merchCopy(order, 'draft', null), null, 'unknown status sends nothing');
});

test('pickup, notes and totals read right', () => {
  assert.match(merchCopy({ ...order, delivery: 'pickup' }, 'shipped', null).buyer.title, /^Ready to collect/);
  assert.match(merchCopy(order, 'shipped', 'NZ Post AB123').buyer.body, /Note: NZ Post AB123$/);
  assert.ok(merchCopy(order, 'changes_requested', 'x'.repeat(1000)).buyer.body.length < 260, 'long notes are cut');
  assert.match(merchCopy(order, 'paid', null).admin.body, /NZ\$600\.00/);
  assert.match(merchCopy({ ...order, buyer_name: null, quote: null }, 'submitted', null).admin.body, /^The buyer ordered jacket/);
});
