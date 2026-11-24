// Unit: merch payment webhook handling with a fake DB and mailer (no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const stub = (path, exports) => {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports };
};

// Fake order store: one approved order, a conditional status update like Postgres.
const order = {
  id: 'o1', ref: 'BM-ABC234', status: 'approved', total_cents: 60000, currency: 'NZD',
  access_hash: createHash('sha256').update('secret').digest('hex'),
  buyer_name: 'Sam Rider', buyer_email: 'sam@example.com', product_id: 'jacket', quote: { product: { label: 'Team jacket' } },
};
const events = [];
// One sponsor budget with NZ$25 left and a NZ$40 hold that expired while unpaid.
const budget = { agreed: 10000, spent: 7500 };
const holds = [{ budget_id: 'b1', cents: 4000, status: 'held' }];
const query = async (sql, params = []) => {
  if (/^SELECT \* FROM merch_orders WHERE ref/.test(sql)) return { rows: params[0] === order.ref ? [order] : [] };
  if (/UPDATE merch_orders SET status = 'paid'/.test(sql)) {
    if (order.status !== 'approved') return { rowCount: 0, rows: [] };
    order.status = 'paid';
    return { rowCount: 1, rows: [{ id: order.id }] };
  }
  if (/INSERT INTO merch_order_events/.test(sql)) { events.push(params); return { rowCount: 1, rows: [] }; }
  if (/SELECT email FROM users WHERE role = 'ADMIN'/.test(sql)) return { rows: [{ email: 'admin@example.com' }] };
  if (/SELECT budget_id, cents FROM merch_sponsor_holds/.test(sql)) return { rows: holds.filter((h) => h.status === 'held') };
  if (/AS left_cents/.test(sql)) return { rows: [{ left_cents: budget.agreed - budget.spent }] };
  if (/UPDATE sponsor_budgets SET spent_cents = spent_cents \+/.test(sql)) { budget.spent += params[1]; return { rowCount: 1 }; }
  if (/UPDATE merch_sponsor_holds SET status = 'spent'/.test(sql)) {
    const h = holds.find((x) => x.budget_id === params[1]);
    Object.assign(h, { status: 'spent', cents: params[2] });
    return { rowCount: 1 };
  }
  return { rowCount: 0, rows: [] };
};
stub('./src/db.js', { query, connect: async () => ({ query, release() {} }) });
const sent = [];
stub('./src/lib/mailer.js', { sendMail: async (m) => { sent.push(m.to); } });
stub('./src/lib/audit.js', { audit: () => {} });

const { markMerchOrderPaid, paymentProblem } = require('./src/routes/merch.js');
const session = (over = {}) => ({ id: 'cs_1', payment_intent: 'pi_1', payment_status: 'paid', currency: 'nzd', amount_total: 60000, metadata: { merch_order_ref: 'BM-ABC234' }, ...over });

test('paymentProblem rejects unpaid, wrong amount and wrong currency', () => {
  assert.equal(paymentProblem(order, session()), null);
  assert.equal(paymentProblem(order, session({ payment_status: 'unpaid' })), 'not_paid');
  assert.equal(paymentProblem(order, session({ amount_total: 100 })), 'amount_mismatch');
  assert.equal(paymentProblem(order, session({ currency: 'usd' })), 'currency_mismatch');
  assert.equal(paymentProblem(null, session()), 'order_missing');
});

test('a wrong amount never marks the order paid', async () => {
  await markMerchOrderPaid({}, session({ amount_total: 1 }));
  assert.equal(order.status, 'approved');
  assert.equal(sent.length, 0);
});

test('a repeated webhook pays once and mails once', async () => {
  await markMerchOrderPaid({}, session());
  await markMerchOrderPaid({}, session());
  assert.equal(order.status, 'paid');
  assert.equal(events.length, 1);
  assert.deepEqual(sent, ['sam@example.com', 'admin@example.com']);
});

test('paying spends the held sponsor discount once, never past the budget', () => {
  assert.equal(holds[0].status, 'spent');
  assert.equal(holds[0].cents, 2500, 'only what was left is spent, the platform carries the rest');
  assert.equal(budget.spent, budget.agreed);
});
