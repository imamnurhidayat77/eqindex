// Transaction updates (merch orders and photo purchases) to the buyer and to
// the admins, by email and in the header bell. Each order keeps ONE bell row
// per person that always shows its latest status, so a busy order never
// floods the bell. Callers that already sent a richer email of their own
// (proof with thumbnail, receipt, shipping) pass buyerMailed / adminMailed.
// Never throws: a failed notification must not undo a payment or a status.
const pool = require('../db');
const { sendMail } = require('./mailer');
const { orderUpdate } = require('./emailTemplates');
const { APP_URL, ORDER_ALERT_EMAILS } = require('../config');

const nzd = (cents) => `NZ$${(Number(cents || 0) / 100).toFixed(2)}`;
const ADMIN_MERCH_PATH = (ref) => `/studio/admin/merch/orders/${ref}`;
const ADMIN_SALES_PATH = '/studio/sales';
// A note (tracking, change request) is cut short here: the full text is on the order page.
const NOTE_PREVIEW = 160;

// Who gets the admin emails: ORDER_ALERT_EMAILS when set, else every admin.
async function adminEmails() {
  if (ORDER_ALERT_EMAILS.length) return ORDER_ALERT_EMAILS;
  return (await pool.query(`SELECT email FROM users WHERE role = 'ADMIN'`)).rows.map((r) => r.email);
}

async function adminUserIds() {
  return (await pool.query(`SELECT id FROM users WHERE role = 'ADMIN'`)).rows.map((r) => r.id);
}

// One row per user per ref, replaced in place and marked unread again.
async function bell(userIds, refKey, { title, body }, link) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  await pool.query(
    `INSERT INTO notifications (user_id, kind, title, body, link, ref_key)
       SELECT u, 'order-update', $2, $3, $4, $5 FROM unnest($1::UUID[]) u
     ON CONFLICT (user_id, kind, ref_key) DO UPDATE SET
       title = EXCLUDED.title, body = EXCLUDED.body, link = EXCLUDED.link,
       count = 1, updated_at = NOW(), read_at = NULL`,
    [ids, title, body, link, refKey]);
}

async function mail(to, { name, eyebrow, title, body }, link, label) {
  const t = orderUpdate({ name, eyebrow, title, body, link, label });
  for (const addr of [].concat(to).filter(Boolean)) {
    await sendMail({ to: addr, subject: t.subject, text: t.text, html: t.html });
  }
}

async function safely(what, fn) {
  try { await fn(); } catch (e) { console.error(`[notify] ${what} failed:`, e.message); }
}

// Buyer and admin wording for each merch status. Pure, so it is unit tested.
function merchCopy(o, status, note) {
  const product = o.quote?.product?.label || o.product_id || 'merch';
  const buyerName = o.buyer_name || 'The buyer';
  const pickup = o.delivery === 'pickup';
  const short = note && note.length > NOTE_PREVIEW ? `${note.slice(0, NOTE_PREVIEW - 1)}…` : note;
  const withNote = (s) => (short ? `${s} Note: ${short}` : s);
  const copy = {
    submitted: [
      ['Order received', `We check your ${product} artwork and send a proof. You pay only after you approve it.`],
      ['New merch order', `${buyerName} ordered ${product}, estimated ${nzd(o.total_cents)}. Check the artwork and send a proof.`],
    ],
    proof_sent: [
      ['Your proof is ready', `Approve your ${product} proof, or tell us what to change.`],
      ['Proof sent', `Proof sent to ${buyerName} for ${product}. Waiting for their answer.`],
    ],
    approved: [
      ['Proof approved', `Thanks. Pay ${nzd(o.total_cents)} to start production of your ${product}.`],
      ['Proof approved', `${buyerName} approved the ${product} proof. Waiting for payment.`],
    ],
    changes_requested: [
      ['Changes requested', withNote(`We got your changes for the ${product} proof and will send a new one.`)],
      ['Changes requested', withNote(`${buyerName} asked for changes to the ${product} proof.`)],
    ],
    paid: [
      ['Payment received', `We received ${nzd(o.total_cents)} for your ${product}. It goes into production now.`],
      ['Order paid', `${buyerName} paid ${nzd(o.total_cents)} for ${product}. Ready for production.`],
    ],
    in_production: [
      ['In production', `Your ${product} order is being made now.`],
      ['In production', `${product} for ${buyerName} is in production.`],
    ],
    shipped: [
      [pickup ? 'Ready to collect' : 'Shipped', withNote(pickup ? `Your ${product} order is ready to collect.` : `Your ${product} order is on its way.`)],
      [pickup ? 'Ready to collect' : 'Shipped', withNote(`${product} for ${buyerName} is ${pickup ? 'ready to collect' : 'shipped'}.`)],
    ],
    delivered: [
      [pickup ? 'Collected' : 'Delivered', `Your ${product} order is ${pickup ? 'collected' : 'delivered'}. Enjoy it.`],
      [pickup ? 'Collected' : 'Delivered', `${product} for ${buyerName} is ${pickup ? 'collected' : 'delivered'}. Order complete.`],
    ],
    cancelled: [
      ['Order cancelled', withNote(`Your ${product} order is cancelled. You were not charged.`)],
      ['Order cancelled', withNote(`The ${product} order from ${buyerName} is cancelled.`)],
    ],
    refunded: [
      ['Order refunded', `Your ${nzd(o.total_cents)} payment for ${product} was refunded.`],
      ['Order refunded', `The ${nzd(o.total_cents)} payment from ${buyerName} for ${product} was refunded.`],
    ],
  }[status];
  if (!copy) return null;
  const [[bTitle, bBody], [aTitle, aBody]] = copy;
  return {
    buyer: { title: `${bTitle} · ${o.ref}`, body: bBody },
    admin: { title: `${aTitle} · ${o.ref}`, body: aBody },
  };
}

// A merch order moved to `status`. `link` is the buyer's emailed order link
// (with its access token); the bell links the logged-in pages instead.
async function notifyMerch(o, status, { note = null, link, buyerMailed = false, adminMailed = false } = {}) {
  const c = merchCopy(o, status, note);
  if (!c) return;
  const eyebrow = `ORDER ${o.ref}`;
  const adminLink = `${APP_URL}${ADMIN_MERCH_PATH(o.ref)}`;
  await safely('merch buyer bell', () => bell([o.buyer_user_id], `merch:${o.ref}`, c.buyer, `/merch/orders/${o.ref}`));
  await safely('merch admin bell', async () => bell(await adminUserIds(), `admin:merch:${o.ref}`, c.admin, ADMIN_MERCH_PATH(o.ref)));
  if (!buyerMailed) {
    await safely('merch buyer mail', () => mail(o.buyer_email, { name: o.buyer_name, eyebrow, ...c.buyer }, link, 'View my order'));
  }
  if (!adminMailed) {
    await safely('merch admin mail', async () => mail(await adminEmails(), { eyebrow, ...c.admin }, adminLink, 'Open the order'));
  }
}

const PURCHASE_COPY = {
  paid: [
    ['Payment received', (what, total) => `We received ${total} for ${what}. Your downloads are ready.`],
    ['Photo sale', (what, total, buyer) => `${buyer} paid ${total} for ${what}.`],
  ],
  refunded: [
    ['Payment refunded', (what, total) => `${total} for ${what} was refunded. Those downloads are closed.`],
    ['Photo sale refunded', (what, total, buyer) => `${total} from ${buyer} for ${what} was refunded.`],
  ],
  disputed: [
    ['Payment disputed', (what, total) => `Your bank opened a dispute on ${total} for ${what}. Those downloads are paused.`],
    ['Photo sale disputed', (what, total, buyer) => `${buyer} disputed ${total} for ${what} with their bank. The sale is revoked.`],
  ],
};

// Photo / package / service purchases that moved to `status` together (one
// checkout). Grouped per buyer: one bell row and one email per checkout.
async function notifyPurchases(ids, status) {
  const copy = PURCHASE_COPY[status];
  if (!copy || !ids?.length) return;
  await safely(`purchases ${status}`, async () => {
    const { rows } = await pool.query(
      `SELECT p.id, p.buyer_user_id, p.buyer_email, p.amount_cents, u.name AS buyer_name
         FROM purchases p LEFT JOIN users u ON u.id = p.buyer_user_id
        WHERE p.id = ANY($1::UUID[]) ORDER BY p.id`, [ids]);
    const groups = new Map();
    for (const r of rows) {
      const k = String(r.buyer_email).toLowerCase();
      groups.set(k, [...(groups.get(k) || []), r]);
    }
    for (const g of groups.values()) {
      const first = g[0];
      const what = g.length === 1 ? '1 item' : `${g.length} items`;
      const total = nzd(g.reduce((s, r) => s + Number(r.amount_cents), 0));
      const buyer = first.buyer_name || first.buyer_email;
      const [[bTitle, bBody], [aTitle, aBody]] = copy;
      const buyerMsg = { title: bTitle, body: bBody(what, total) };
      const adminMsg = { title: aTitle, body: aBody(what, total, buyer) };
      const receipts = `/receipts?purchases=${g.map((r) => r.id).join(',')}`;
      // Keyed by the first purchase, the same key the unpaid nudge uses, so
      // "payment received" replaces "still interested?" instead of sitting next to it.
      const refKey = `purchase:${first.id}`;
      await safely('purchase buyer bell', () => bell([first.buyer_user_id], refKey, buyerMsg, receipts));
      await safely('purchase admin bell', async () => bell(await adminUserIds(), `admin:${refKey}`, adminMsg, ADMIN_SALES_PATH));
      await safely('purchase buyer mail', () => mail(first.buyer_email, { name: first.buyer_name, eyebrow: 'PHOTO PURCHASE', ...buyerMsg }, `${APP_URL}${receipts}`, 'View my receipt'));
      await safely('purchase admin mail', async () => mail(await adminEmails(), { eyebrow: 'PHOTO SALE', ...adminMsg }, `${APP_URL}${ADMIN_SALES_PATH}`, 'Open sales'));
    }
  });
}

module.exports = { notifyMerch, notifyPurchases, merchCopy, adminEmails };
