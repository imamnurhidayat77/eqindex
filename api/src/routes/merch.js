// Merch orders (Imam, 2026-11-24): the buyer sends a design with sizes and
// quantities, an admin checks the artwork and sends a proof, the buyer pays
// after approving it (payment lands in a later phase). Prices are always
// re-quoted here with the same rules the designer shows (src/lib/merch is a
// copy of web-bossmedia/lib, kept identical by merch-sync.test.mjs).
const crypto = require('crypto');
const multer = require('multer');
const pool = require('../db');
const { asyncH } = require('../lib/async');
const { audit } = require('../lib/audit');
const { EMAIL_RE, needRole } = require('../lib/auth');
const { UUID_RE } = require('../lib/resolve');
const { throttled } = require('../lib/ratelimit');
const mediaStore = require('../lib/mediaStore');
const { APP_URL } = require('../config');

let merchLib = null;
const lib = () => (merchLib ||= Promise.all([import('../lib/merch/merch.mjs'), import('../lib/merch/merch-config.mjs')])
  .then(([m, c]) => ({ ...m, ...c })));

const SETTINGS_KEY = 'merch_order_settings';
const LOGO_MAX_BYTES = 10 * 1024 * 1024; // print artwork, larger than photo logos
const LOGO_MIMES = ['image/png', 'image/jpeg'];
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const NZ_POSTCODE_RE = /^\d{4}$/;
const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const newRef = () => `BM-${Array.from({ length: 6 }, () => REF_ALPHABET[crypto.randomInt(REF_ALPHABET.length)]).join('')}`;
const newSecret = () => crypto.randomBytes(24).toString('base64url');
const str = (v, max) => String(v ?? '').trim().slice(0, max);

async function loadSettings(m) {
  const { rows } = await pool.query('SELECT value FROM admin_settings WHERE key = $1', [SETTINGS_KEY]);
  let stored = {};
  try { stored = rows.length ? JSON.parse(rows[0].value) : {}; } catch { stored = {}; }
  return m.merchOrderSettings(stored);
}

// Pure shape check of an order body (no DB). Returns { values, errors }.
// Slot values are checked for form here; whether a sponsor logo or an
// upload really exists is checked against the DB by the route.
function parseOrderInput(body, m) {
  const b = body || {};
  const errors = [];
  const product = m.merchProduct(b.productId);
  if (!product) return { values: null, errors: ['unknown product'] };
  const color = String(b.color || '');
  if (!m.isMerchColor(product.id, color)) errors.push('colour not offered for this product');

  const rawLines = Array.isArray(b.lines) ? b.lines : [];
  const lines = [];
  const seen = new Set();
  for (const l of rawLines.slice(0, m.MERCH_ORDER_RULES.maxLines + 1)) {
    const size = String(l?.size || '');
    const qty = Number(l?.qty);
    if (!m.isMerchSize(product.id, size)) { errors.push(`size ${str(size, 20)} not offered`); continue; }
    if (!Number.isInteger(qty) || qty < 1 || qty > m.MERCH_ORDER_RULES.maxUnitsPerLine) { errors.push(`quantity for ${size} must be 1 to ${m.MERCH_ORDER_RULES.maxUnitsPerLine}`); continue; }
    if (seen.has(size)) { errors.push(`size ${size} listed twice`); continue; }
    seen.add(size);
    lines.push({ size, qty });
  }
  if (rawLines.length > m.MERCH_ORDER_RULES.maxLines) errors.push('too many size rows');
  if (!lines.length && !errors.length) errors.push('add at least one size and quantity');

  const allowed = new Set(m.merchPositions(product.id).map((p) => p.id));
  const slots = {};
  const sponsorLogoIds = new Set();
  const uploadIds = new Set();
  const personalLogoIds = new Set();
  for (const [pos, raw] of Object.entries(b.slots || {})) {
    const v = String(raw || '');
    if (!v) continue;
    if (!allowed.has(pos)) { errors.push(`unknown logo slot ${str(pos, 30)}`); continue; }
    if (v.startsWith('club:')) {
      if (!m.merchClub(v.slice(5))) { errors.push(`unknown club logo in ${pos}`); continue; }
    } else if (v.startsWith('mlogo:')) {
      if (!UUID_RE.test(v.slice(6))) { errors.push(`bad uploaded logo in ${pos}`); continue; }
      uploadIds.add(v.slice(6));
    } else if (v.startsWith('my:')) {
      if (!UUID_RE.test(v.slice(3))) { errors.push(`bad saved logo in ${pos}`); continue; }
      personalLogoIds.add(v.slice(3));
    } else if (UUID_RE.test(v)) {
      sponsorLogoIds.add(v);
    } else { errors.push(`bad logo in ${pos}`); continue; }
    slots[pos] = v;
  }
  const slotZoom = {};
  const slotShift = {};
  for (const pos of Object.keys(slots)) {
    const z = Number(b.slotZoom?.[pos]);
    if (Number.isFinite(z)) slotZoom[pos] = Math.min(125, Math.max(m.LOGO_ZOOM_MIN * 100, Math.round(z)));
    const s = b.slotShift?.[pos];
    if (s && typeof s === 'object') {
      slotShift[pos] = { x: m.clampShift(s.x), y: m.clampShift(s.y), r: m.clampSpin(s.r), f: !!s.f };
    }
  }

  const c = b.contact || {};
  const name = str(c.name, 100);
  const email = str(c.email, 254).toLowerCase();
  const phone = str(c.phone, 30);
  const club = str(c.club, 100);
  if (name.length < 2) errors.push('name is required');
  if (!EMAIL_RE.test(email)) errors.push('a valid email is required');
  if (phone && !/^[+\d][\d\s()-]{5,29}$/.test(phone)) errors.push('phone number looks wrong');

  const delivery = b.delivery === 'pickup' ? 'pickup' : b.delivery === 'courier' ? 'courier' : null;
  if (!delivery) errors.push('choose courier or club pickup');
  let address = null;
  if (delivery === 'courier') {
    const a = b.address || {};
    address = { line1: str(a.line1, 120), line2: str(a.line2, 120), city: str(a.city, 60), postcode: str(a.postcode, 4) };
    if (address.line1.length < 3) errors.push('street address is required');
    if (address.city.length < 2) errors.push('town or city is required');
    if (!NZ_POSTCODE_RE.test(address.postcode)) errors.push('NZ postcode must be 4 digits');
  }
  if (delivery === 'pickup' && !club) errors.push('club name is required for club pickup');

  const claims = Array.isArray(b.uploads) ? b.uploads.slice(0, 20)
    .filter((u) => UUID_RE.test(String(u?.id || '')) && typeof u?.secret === 'string')
    .map((u) => ({ id: String(u.id), secret: String(u.secret).slice(0, 64) })) : [];
  for (const id of uploadIds) if (!claims.some((u) => u.id === id)) errors.push('uploaded logo is missing its key, upload it again');

  return {
    values: {
      product, color, lines, slots, slotZoom, slotShift, sponsorLogoIds: [...sponsorLogoIds], uploadIds: [...uploadIds],
      personalLogoIds: [...personalLogoIds],
      claims, contact: { name, email, phone: phone || null, club: club || null }, delivery, address,
      notes: str(b.notes, 500) || null,
    },
    errors,
  };
}

// Sponsor budgets for merch (migration 111): an order holds its sponsor
// discount when placed, spends it when paid, releases it on refund. Budget
// left (SQL, budget alias b) = agreed - spent - active holds; a hold stops
// counting once expired (14 days after proof approval, unpaid).
const MERCH_BUDGET_LEFT_SQL = `(b.agreed_cents - b.spent_cents - COALESCE((SELECT SUM(h.cents) FROM merch_sponsor_holds h
  WHERE h.budget_id = b.id AND h.status = 'held' AND (h.expires_at IS NULL OR h.expires_at > NOW())), 0))`;
const HOLD_DAYS_TO_PAY = 14;

// Funded discount per sponsor logo: the best active merch budget (applies_to
// merch, migration 109) of its sponsor with enough left for one more item.
// Photo budgets never discount merch. Unfunded logos discount nothing.
async function sponsorDiscounts(db, logoIds) {
  if (!logoIds.length) return {};
  const { rows } = await db.query(
    `SELECT l.id AS logo_id, s.id AS sponsor_id, s.name AS sponsor_name,
       pick.id AS budget_id, COALESCE(pick.discount_cents, 0) AS discount_cents, COALESCE(pick.left_cents, 0) AS left_cents
     FROM sponsor_logos l JOIN sponsors s ON s.id = l.sponsor_id
     LEFT JOIN LATERAL (
       SELECT b.id, b.discount_cents, ${MERCH_BUDGET_LEFT_SQL} AS left_cents FROM sponsor_budgets b
       WHERE b.sponsor_id = s.id AND b.status = 'active' AND (b.ends_on IS NULL OR b.ends_on >= CURRENT_DATE)
         AND b.discount_cents > 0 AND b.applies_to = 'merch' AND ${MERCH_BUDGET_LEFT_SQL} >= b.discount_cents
       ORDER BY b.discount_cents DESC, b.id LIMIT 1
     ) pick ON TRUE
     WHERE l.id = ANY($1::UUID[]) AND l.is_active AND s.is_active AND s.kind = 'official'`,
    [logoIds]);
  return Object.fromEntries(rows.map((r) => [r.logo_id, { ...r, discount_cents: Number(r.discount_cents), left_cents: Number(r.left_cents) }]));
}

// Largest per-item discount each sponsor may give on this order so that
// units x discount never passes its budget left. A sponsor on two slots
// counts twice unless one discount per sponsor per item applies.
function perItemSponsorCaps(slots, funded, units, oncePerItem) {
  const slotsPerSponsor = {};
  for (const v of Object.values(slots || {})) {
    const f = funded[v];
    if (!f?.budget_id) continue;
    slotsPerSponsor[f.sponsor_id] = oncePerItem ? 1 : (slotsPerSponsor[f.sponsor_id] || 0) + 1;
  }
  const caps = {};
  for (const f of Object.values(funded)) {
    const n = slotsPerSponsor[f.sponsor_id];
    if (n) caps[f.sponsor_id] = Math.floor(f.left_cents / (Math.max(1, units) * n));
  }
  return caps;
}

// Splits the order's sponsor discount (after the per-item and per-order
// caps) between sponsors in proportion to what each funds per item.
// Largest remainder keeps the parts summing exactly to the discount.
function splitSponsorDiscount(quote, slots, sponsorOf) {
  const weight = {};
  for (const line of quote?.item?.lines || []) {
    if (line.kind !== 'sponsor' || !(line.cents < 0)) continue;
    const key = sponsorOf(slots[line.slot]);
    if (key) weight[key] = (weight[key] || 0) - line.cents;
  }
  const keys = Object.keys(weight).sort();
  const total = keys.reduce((n, k) => n + weight[k], 0);
  const discount = Number(quote?.discountCents) || 0;
  if (!total || !discount) return {};
  const parts = keys.map((k) => ({ k, exact: (discount * weight[k]) / total }));
  const out = Object.fromEntries(parts.map((x) => [x.k, Math.floor(x.exact)]));
  let rest = discount - Object.values(out).reduce((n, c) => n + c, 0);
  for (const x of [...parts].sort((a, b) => (b.exact % 1) - (a.exact % 1) || (a.k < b.k ? -1 : 1))) {
    if (rest <= 0) break;
    out[x.k] += 1;
    rest -= 1;
  }
  return out;
}

function publicOrder(o, lines) {
  return {
    ref: o.ref, status: o.status, productId: o.product_id, color: o.color, design: o.design,
    delivery: o.delivery, address: o.address, notes: o.notes, quote: o.quote,
    totalCents: o.total_cents, currency: o.currency, createdAt: o.created_at, updatedAt: o.updated_at,
    contact: { name: o.buyer_name, email: o.buyer_email, phone: o.buyer_phone, club: o.club_name },
    lines: lines.map((l) => ({ size: l.size, qty: l.qty })),
  };
}

// Art proof step (F3). Proofs live in R2 under the proof_sent event's id,
// so no extra table is needed: the latest proof_sent event is the proof
// the buyer answers.
const REF_RE = /^BM-[A-Z0-9]{6}$/;
const ORDER_STATUSES = ['submitted', 'artwork_review', 'changes_requested', 'proof_sent', 'approved',
  'paid', 'in_production', 'shipped', 'delivered', 'cancelled', 'refunded'];
const PROOF_FROM = ['submitted', 'artwork_review', 'changes_requested', 'proof_sent'];
const PROOF_MAX_BYTES = 15 * 1024 * 1024;
const PROOF_MIMES = ['image/png', 'image/jpeg', 'image/webp'];
const PROOF_MAX_PX = 2400;
const NOTE_MAX = 1000;
const CHANGE_NOTE_MIN = 3;
const ARTWORK_LINK_SECONDS = 15 * 60;
const canSendProof = (status) => PROOF_FROM.includes(status);
const proofKey = (orderId, eventId) => `merch/proofs/${orderId}/${eventId}.jpg`;
const proofPath = (ref, eventId, token) => `/api/merch/orders/${ref}/proofs/${eventId}?t=${token}`;

// Link token for mails sent after the order (the buyer's own token is only
// stored hashed). Keyed on that stored hash: only someone with the database
// can make one, and it opens exactly this order.
const mailToken = (o) => crypto.createHmac('sha256', o.access_hash).update(`merch-order-link:${o.ref}`).digest('base64url');
const sameText = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
function tokenOpens(o, token) {
  const t = String(token || '').slice(0, 128);
  return !!t && (sameText(sha256(t), o.access_hash) || sameText(t, mailToken(o)));
}

// The order in :ref when this request may see it: its link token, the
// logged-in owner, or (when allowed) an admin.
async function viewableOrder(req, { admin }) {
  const ref = String(req.params.ref || '').toUpperCase();
  if (!REF_RE.test(ref)) return null;
  const o = (await pool.query('SELECT * FROM merch_orders WHERE ref = $1', [ref])).rows[0];
  if (!o) return null;
  const token = req.query.t || req.body?.t;
  const isAdmin = admin && req.authUser?.role === 'ADMIN';
  const ok = tokenOpens(o, token) || (req.authUser && req.authUser.id === o.buyer_user_id) || isAdmin;
  return ok ? { o, isAdmin } : null;
}

// Buyer's answer to a proof. Asking for changes needs a short note.
function parseProofResponse(body) {
  const b = body || {};
  const decision = b.decision === 'approve' ? 'approved' : b.decision === 'changes' ? 'changes_requested' : null;
  if (!decision) return { error: 'choose approve or request changes' };
  const note = str(b.note, NOTE_MAX) || null;
  if (decision === 'changes_requested' && (note || '').length < CHANGE_NOTE_MIN) return { error: 'tell us what to change' };
  return { decision, note };
}

// Timeline for the order page. Proof events carry their image link.
function publicEvents(o, events) {
  const token = mailToken(o);
  return events.map((e) => ({
    id: String(e.id), status: e.status, note: e.note, at: e.created_at,
    proofPath: e.status === 'proof_sent' ? proofPath(o.ref, e.id, token) : null,
  }));
}

// Payment (F4): after the proof is approved the buyer pays the total they
// approved (the stored quote, never re-priced). Stripe's webhook moves the
// order to paid; the conditional update makes repeated webhooks a no-op.
const STRIPE_MIN_CENTS = 50; // Stripe's smallest NZD charge
const stripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    const err = new Error('payments are not available yet, try again later');
    err.status = 503;
    throw err;
  }
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
};
const nzdText = (cents) => `NZ$${(Number(cents) / 100).toFixed(2)}`;
const productLabelOf = (o) => o.quote?.product?.label || o.product_id;

async function adminEmails() {
  return (await pool.query(`SELECT email FROM users WHERE role = 'ADMIN'`)).rows.map((r) => r.email);
}

// Whether a completed Checkout session really pays this order. Returns
// null when it does, or the reason it is rejected.
function paymentProblem(o, session) {
  if (!o) return 'order_missing';
  if (session.payment_status !== 'paid') return 'not_paid';
  if (String(session.currency || '').toLowerCase() !== String(o.currency || 'NZD').toLowerCase()) return 'currency_mismatch';
  if (session.amount_total !== o.total_cents) return 'amount_mismatch';
  return null;
}

// Paid: each held discount moves into its budget's spent_cents. A hold
// that expired meanwhile may meet a budget other orders now hold or spent:
// only what is left is spent, and the platform carries the rest.
async function spendSponsorHolds(client, orderId) {
  const holds = (await client.query(
    `SELECT budget_id, cents FROM merch_sponsor_holds WHERE order_id = $1 AND status = 'held' ORDER BY budget_id`, [orderId])).rows;
  for (const h of holds) {
    await client.query('SELECT id FROM sponsor_budgets WHERE id = $1 FOR UPDATE', [h.budget_id]);
    // Left for this order: other orders' live holds stay untouched.
    const left = (await client.query(
      `SELECT b.agreed_cents - b.spent_cents - COALESCE((SELECT SUM(o.cents) FROM merch_sponsor_holds o
         WHERE o.budget_id = b.id AND o.order_id <> $2 AND o.status = 'held' AND (o.expires_at IS NULL OR o.expires_at > NOW())), 0) AS left_cents
       FROM sponsor_budgets b WHERE b.id = $1`, [h.budget_id, orderId])).rows[0]?.left_cents;
    const spent = Math.min(Number(h.cents), Math.max(0, Number(left) || 0));
    await client.query('UPDATE sponsor_budgets SET spent_cents = spent_cents + $2 WHERE id = $1', [h.budget_id, spent]);
    await client.query(
      `UPDATE merch_sponsor_holds SET status = 'spent', cents = $3, updated_at = NOW() WHERE order_id = $1 AND budget_id = $2`,
      [orderId, h.budget_id, spent]);
  }
}

// Refunded: what the order spent goes back to each budget.
async function releaseSponsorSpend(orderId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const holds = (await client.query(
      `SELECT budget_id, cents, status FROM merch_sponsor_holds WHERE order_id = $1 AND status IN ('held', 'spent')
       ORDER BY budget_id FOR UPDATE`, [orderId])).rows;
    for (const h of holds) {
      if (h.status === 'spent') {
        await client.query('UPDATE sponsor_budgets SET spent_cents = GREATEST(0, spent_cents - $2) WHERE id = $1', [h.budget_id, h.cents]);
      }
      await client.query(
        `UPDATE merch_sponsor_holds SET status = 'released', updated_at = NOW() WHERE order_id = $1 AND budget_id = $2`,
        [orderId, h.budget_id]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[merch.refund] sponsor budget release failed:', e.message);
  } finally {
    client.release();
  }
}

// checkout.session.completed for a merch order (called from the Stripe
// webhook in media.js). Always resolves: the webhook answers 200 either way.
async function markMerchOrderPaid(req, session) {
  const ref = String(session.metadata?.merch_order_ref || '').toUpperCase();
  if (!REF_RE.test(ref)) return;
  const o = (await pool.query('SELECT * FROM merch_orders WHERE ref = $1', [ref])).rows[0];
  const problem = paymentProblem(o, session);
  if (problem) {
    if (problem !== 'not_paid') {
      console.error('[merch.pay] webhook rejected', { ref, problem });
      audit(req, 'stripe.webhook.rejected', 'merch_order', o?.id || null, { ref, reason: problem, session: session.id });
    }
    return;
  }
  const client = await pool.connect();
  let moved;
  try {
    await client.query('BEGIN');
    moved = await client.query(
      `UPDATE merch_orders SET status = 'paid', updated_at = NOW() WHERE id = $1 AND status = 'approved' RETURNING id`, [o.id]);
    if (moved.rowCount) {
      await client.query(`INSERT INTO merch_order_events (order_id, status, note) VALUES ($1, 'paid', $2)`,
        [o.id, `Stripe ${session.payment_intent || session.id}`]);
      await spendSponsorHolds(client, o.id);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  if (!moved.rowCount) return; // already paid (repeated webhook) or no longer approved
  audit(req, 'merch.order.paid', 'merch_order', o.id, { ref, session: session.id, total_cents: o.total_cents });
  const t = require('../lib/emailTemplates');
  const { sendMail } = require('../lib/mailer');
  const facts = { ref, productLabel: productLabelOf(o), totalText: nzdText(o.total_cents) };
  try {
    const mail = t.merchOrderPaid({ ...facts, name: o.buyer_name, link: `${APP_URL}/merch/orders/${ref}?t=${mailToken(o)}` });
    await sendMail({ to: o.buyer_email, subject: mail.subject, text: mail.text, html: mail.html });
  } catch (e) { console.error('[merch.pay] buyer mail failed:', e.message); }
  try {
    const mail = t.merchOrderPaidAdmin({ ...facts, buyerName: o.buyer_name, link: `${APP_URL}/studio/admin` });
    for (const to of await adminEmails()) await sendMail({ to, subject: mail.subject, text: mail.text, html: mail.html });
  } catch (e) { console.error('[merch.pay] admin mail failed:', e.message); }
}

// A full refund of a merch payment (charge.refunded, called from media.js).
async function markMerchOrderRefunded(req, paymentIntentId) {
  let ref = '';
  try {
    ref = String((await stripe().paymentIntents.retrieve(String(paymentIntentId))).metadata?.merch_order_ref || '').toUpperCase();
  } catch (e) { console.error('[merch.refund] payment lookup failed:', e.message); return; }
  if (!REF_RE.test(ref)) return;
  const r = await pool.query(
    `UPDATE merch_orders SET status = 'refunded', updated_at = NOW()
      WHERE ref = $1 AND status IN ('paid', 'in_production', 'shipped', 'delivered') RETURNING id`, [ref]);
  if (!r.rowCount) return;
  await pool.query(`INSERT INTO merch_order_events (order_id, status, note) VALUES ($1, 'refunded', $2)`,
    [r.rows[0].id, `Stripe ${paymentIntentId}`]);
  await releaseSponsorSpend(r.rows[0].id);
  audit(req, 'merch.order.refunded', 'merch_order', r.rows[0].id, { ref, pi: String(paymentIntentId) });
}

// Fulfilment (F5): after payment the admin moves the order forward one
// step at a time. For club pickup, shipped means ready to collect.
const FULFILMENT_NEXT = { paid: 'in_production', in_production: 'shipped', shipped: 'delivered' };
const TRACKING_MAX = 200;

// Admin's status change: only the next step, with an optional note
// (tracking for courier). Returns { to, note } or { error }.
function parseFulfilment(from, body) {
  const to = String(body?.status || '');
  if (FULFILMENT_NEXT[from] !== to) return { error: `an order that is ${from} cannot move to ${to || 'that status'}` };
  return { to, note: str(body?.note, TRACKING_MAX) || null };
}

module.exports = function mountMerchRoutes(app) {
  // Live order settings, so the designer's estimate matches the server.
  app.get('/api/merch/settings', asyncH(async (req, res) => {
    const m = await lib();
    res.json({ data: await loadSettings(m) });
  }));

  // Admin only: delivery prices, pickup on/off, sponsor cap per order.
  app.put('/admin/merch/settings', needRole('ADMIN'), asyncH(async (req, res) => {
    const m = await lib();
    const b = req.body || {};
    const errors = [];
    const cents = (k) => {
      const v = Number(b[k]);
      if (!Number.isInteger(v) || v < 0 || v > 1000000) errors.push(`${k} must be whole cents, 0 to 1000000`);
      return v;
    };
    const next = { courierCents: cents('courierCents'), freeOverCents: cents('freeOverCents'), sponsorCapCents: cents('sponsorCapCents') };
    if (typeof b.pickupEnabled !== 'boolean') errors.push('pickupEnabled must be true or false');
    next.pickupEnabled = b.pickupEnabled;
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    await pool.query(
      `INSERT INTO admin_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [SETTINGS_KEY, JSON.stringify(next)]);
    audit(req, 'merch.settings.edit', 'admin_settings', SETTINGS_KEY, next);
    res.json({ data: m.merchOrderSettings(next) });
  }));

  // Buyer artwork for an order. Guests allowed: the returned secret is the
  // only way to attach it to an order, so one buyer can never use another's.
  const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LOGO_MAX_BYTES, files: 1 } });
  app.post('/api/merch/logos', logoUpload.single('logo'), asyncH(async (req, res) => {
    if (await throttled(pool, req.ip, 'merch-logo', 30)) return res.status(429).json({ error: 'too many uploads, try again later' });
    const f = req.file;
    if (!f?.buffer?.length) return res.status(400).json({ error: 'choose a PNG or JPEG logo up to 10 MB' });
    const { fileTypeFromBuffer } = await import('file-type');
    const real = (await fileTypeFromBuffer(f.buffer).catch(() => null))?.mime || '';
    if (!LOGO_MIMES.includes(real)) return res.status(400).json({ error: 'logo must be a real PNG or JPEG image' });
    const meta = await require('sharp')(f.buffer).metadata().catch(() => null);
    if (!meta?.width || !meta?.height) return res.status(400).json({ error: 'logo image could not be read' });
    const secret = newSecret();
    const ins = await pool.query(
      `INSERT INTO merch_order_logos (claim_hash, mime, bytes, width, height) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [sha256(secret), real, f.buffer.length, meta.width, meta.height]);
    const id = ins.rows[0].id;
    const key = `merch/logos/${id}.${real === 'image/png' ? 'png' : 'jpg'}`;
    try {
      await mediaStore.putBuffer(key, f.buffer, real);
    } catch {
      await pool.query('DELETE FROM merch_order_logos WHERE id = $1', [id]).catch(() => {});
      return res.status(502).json({ error: 'logo storage unavailable, try again shortly' });
    }
    await pool.query('UPDATE merch_order_logos SET r2_key = $2 WHERE id = $1', [id, key]);
    res.status(201).json({ data: { id, secret, width: meta.width, height: meta.height } });
  }));

  app.post('/api/merch/orders', asyncH(async (req, res) => {
    if (await throttled(pool, req.ip, 'merch-order', 10)) return res.status(429).json({ error: 'too many orders, try again later' });
    const m = await lib();
    const { values: v, errors } = parseOrderInput(req.body, m);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    // Saved account logos ("My sponsor logos", shared with photos) work
    // only for their owner, same rule as photo checkout.
    if (v.personalLogoIds.length) {
      if (!req.authUser) return res.status(401).json({ error: 'log in to use your saved logos' });
      const own = await pool.query(
        `SELECT l.id FROM sponsor_logos l JOIN sponsors s ON s.id = l.sponsor_id
         WHERE l.id = ANY($1::UUID[]) AND l.is_active AND s.is_active AND s.kind = 'personal' AND s.user_id = $2`,
        [v.personalLogoIds, req.authUser.id]);
      if (own.rowCount !== v.personalLogoIds.length) return res.status(403).json({ error: 'a saved logo is not available to you' });
    }
    const settings = await loadSettings(m);
    const units = v.lines.reduce((n, l) => n + l.qty, 0);

    const secret = newSecret();
    const client = await pool.connect();
    let order;
    let quote;
    try {
      await client.query('BEGIN');
      // Lock this order's sponsor budgets first, so two orders placed at the
      // same moment can never both take the same budget left.
      if (v.sponsorLogoIds.length) {
        await client.query(
          `SELECT b.id FROM sponsor_budgets b JOIN sponsor_logos l ON l.sponsor_id = b.sponsor_id
           WHERE l.id = ANY($1::UUID[]) AND b.applies_to = 'merch' ORDER BY b.id FOR UPDATE OF b`, [v.sponsorLogoIds]);
      }
      const funded = await sponsorDiscounts(client, v.sponsorLogoIds);
      if (v.sponsorLogoIds.some((id) => !funded[id])) {
        const e = new Error('a sponsor logo is no longer available, pick another'); e.status = 400; throw e;
      }
      const caps = perItemSponsorCaps(v.slots, funded, units, settings.sponsorDiscountOncePerItem);
      const sponsorOf = (id) => funded[id]?.sponsor_id || null;
      quote = m.quoteMerchOrder(v.product.id, v.slots, v.lines, {
        strict: true,
        discountFor: (id) => Math.min(funded[id]?.discount_cents || 0, caps[funded[id]?.sponsor_id] ?? 0),
        sponsorOf: (id) => sponsorOf(id) || id,
        labelFor: (id) => funded[id]?.sponsor_name || (String(id).startsWith('club:') ? 'Club logo' : 'Your logo'),
      }, v.delivery, settings);
      if (!quote) { const e = new Error('this delivery option is not available'); e.status = 400; throw e; }

      for (let attempt = 0; attempt < 5 && !order; attempt++) {
        const r = await client.query(
          `INSERT INTO merch_orders (ref, access_hash, buyer_user_id, buyer_email, buyer_name, buyer_phone, club_name,
             product_id, color, design, delivery, address, notes, quote, total_cents)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (ref) DO NOTHING RETURNING *`,
          [newRef(), sha256(secret), req.authUser?.id || null, v.contact.email, v.contact.name, v.contact.phone, v.contact.club,
            v.product.id, v.color, JSON.stringify({ slots: v.slots, slotZoom: v.slotZoom, slotShift: v.slotShift }),
            v.delivery, v.address ? JSON.stringify(v.address) : null, v.notes, JSON.stringify(quote), quote.totalCents]);
        order = r.rows[0];
      }
      if (!order) throw new Error('could not allocate an order reference');
      const budgetOf = Object.fromEntries(Object.values(funded).filter((f) => f.budget_id).map((f) => [f.sponsor_id, f.budget_id]));
      for (const [sponsorId, cents] of Object.entries(splitSponsorDiscount(quote, v.slots, sponsorOf))) {
        if (cents > 0 && budgetOf[sponsorId]) {
          await client.query('INSERT INTO merch_sponsor_holds (order_id, budget_id, cents) VALUES ($1, $2, $3)', [order.id, budgetOf[sponsorId], cents]);
        }
      }
      for (const l of v.lines) {
        await client.query('INSERT INTO merch_order_lines (order_id, size, qty) VALUES ($1, $2, $3)', [order.id, l.size, l.qty]);
      }
      for (const id of v.uploadIds) {
        const claim = v.claims.find((u) => u.id === id);
        const r = await client.query(
          `UPDATE merch_order_logos SET order_id = $1 WHERE id = $2 AND order_id IS NULL AND claim_hash = $3 AND r2_key <> '' RETURNING id`,
          [order.id, id, sha256(claim.secret)]);
        if (!r.rowCount) { const e = new Error('uploaded logo not found, upload it again'); e.status = 400; throw e; }
      }
      await client.query(
        `INSERT INTO merch_order_events (order_id, status, note, actor_user_id) VALUES ($1, 'submitted', NULL, $2)`,
        [order.id, req.authUser?.id || null]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    const link = `${APP_URL}/merch/orders/${order.ref}?t=${secret}`;
    try {
      const t = require('../lib/emailTemplates').merchOrderReceived({
        name: v.contact.name, ref: order.ref, productLabel: v.product.label, units: quote.units,
        totalText: `NZ$${(quote.totalCents / 100).toFixed(2)}`, link,
      });
      await require('../lib/mailer').sendMail({ to: v.contact.email, subject: t.subject, text: t.text, html: t.html });
    } catch (e) {
      console.error('[merch.order] confirmation mail failed:', e.message);
    }
    audit(req, 'merch.order.submit', 'merch_order', order.id, { ref: order.ref, units: quote.units, total_cents: quote.totalCents });
    res.status(201).json({ data: { ref: order.ref, token: secret, quote } });
  }));

  // One order: the buyer's link token, the logged-in owner, or an admin.
  // Admins also get short-lived links to the buyer's uploaded artwork.
  app.get('/api/merch/orders/:ref', asyncH(async (req, res) => {
    const found = await viewableOrder(req, { admin: true });
    if (!found) return res.status(404).json({ error: 'order not found' });
    const { o, isAdmin } = found;
    const [lines, events] = await Promise.all([
      pool.query('SELECT size, qty FROM merch_order_lines WHERE order_id = $1 ORDER BY size', [o.id]),
      pool.query('SELECT id, status, note, created_at FROM merch_order_events WHERE order_id = $1 ORDER BY created_at, id', [o.id]),
    ]);
    const data = { ...publicOrder(o, lines.rows), events: publicEvents(o, events.rows) };
    if (isAdmin) {
      const logos = await pool.query(`SELECT id, r2_key, width, height FROM merch_order_logos WHERE order_id = $1 AND r2_key <> ''`, [o.id]);
      data.artwork = await Promise.all(logos.rows.map(async (l) => ({
        id: l.id, width: l.width, height: l.height,
        url: await mediaStore.signedDownloadUrl(l.r2_key, ARTWORK_LINK_SECONDS, `${o.ref}-logo-${l.id.slice(0, 8)}${l.r2_key.slice(l.r2_key.lastIndexOf('.'))}`).catch(() => null),
      })));
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ data });
  }));

  // A proof image of an order, for the same viewers as the order itself
  // (the emailed thumbnail uses the order's mail token).
  app.get('/api/merch/orders/:ref/proofs/:eventId', asyncH(async (req, res) => {
    const found = await viewableOrder(req, { admin: true });
    const eventId = String(req.params.eventId || '');
    if (!found || !/^\d{1,18}$/.test(eventId)) return res.status(404).json({ error: 'proof not found' });
    const ev = await pool.query(`SELECT id FROM merch_order_events WHERE id = $1 AND order_id = $2 AND status = 'proof_sent'`, [eventId, found.o.id]);
    if (!ev.rowCount) return res.status(404).json({ error: 'proof not found' });
    let obj;
    try { obj = await mediaStore.getStream(proofKey(found.o.id, eventId)); } catch { return res.status(404).json({ error: 'proof not found' }); }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    obj.stream.pipe(res);
  }));

  // Buyer answers the latest proof: approve it, or ask for changes with a
  // note. Only the buyer (link token or owner account), only while a proof
  // is waiting. The status update is conditional, so a double click or two
  // tabs never record two answers.
  app.post('/api/merch/orders/:ref/proof-response', asyncH(async (req, res) => {
    if (await throttled(pool, req.ip, 'merch-proof-response', 20)) return res.status(429).json({ error: 'too many tries, try again later' });
    const found = await viewableOrder(req, { admin: false });
    if (!found) return res.status(404).json({ error: 'order not found' });
    const { decision, note, error } = parseProofResponse(req.body);
    if (error) return res.status(400).json({ error });
    const { o } = found;
    const client = await pool.connect();
    let moved;
    try {
      await client.query('BEGIN');
      moved = await client.query(
        `UPDATE merch_orders SET status = $2, updated_at = NOW() WHERE id = $1 AND status = 'proof_sent' RETURNING id`,
        [o.id, decision]);
      if (moved.rowCount) {
        await client.query('INSERT INTO merch_order_events (order_id, status, note, actor_user_id) VALUES ($1, $2, $3, $4)',
          [o.id, decision, note, req.authUser?.id || null]);
        // Approved: the sponsor discount stays held for HOLD_DAYS_TO_PAY.
        if (decision === 'approved') {
          await client.query(
            `UPDATE merch_sponsor_holds SET expires_at = NOW() + make_interval(days => $2), updated_at = NOW()
             WHERE order_id = $1 AND status = 'held'`, [o.id, HOLD_DAYS_TO_PAY]);
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    if (!moved.rowCount) return res.status(409).json({ error: 'this proof was already answered, reload the page' });
    try {
      const admins = await adminEmails();
      const t = require('../lib/emailTemplates').merchProofAnswered({
        ref: o.ref, buyerName: o.buyer_name, productLabel: o.quote?.product?.label || o.product_id,
        approved: decision === 'approved', note, link: `${APP_URL}/studio/admin`,
      });
      const { sendMail } = require('../lib/mailer');
      for (const to of admins) await sendMail({ to, subject: t.subject, text: t.text, html: t.html });
    } catch (e) {
      console.error('[merch.proof] admin mail failed:', e.message);
    }
    audit(req, `merch.proof.${decision}`, 'merch_order', o.id, { ref: o.ref });
    res.json({ data: { status: decision } });
  }));

  // Buyer pays an approved order: a Stripe Checkout session for the total
  // they approved. Clicking twice reuses the same session (idempotency key).
  app.post('/api/merch/orders/:ref/checkout', asyncH(async (req, res) => {
    if (await throttled(pool, req.ip, 'merch-checkout', 20)) return res.status(429).json({ error: 'too many tries, try again later' });
    const found = await viewableOrder(req, { admin: false });
    if (!found) return res.status(404).json({ error: 'order not found' });
    const { o } = found;
    if (o.status !== 'approved') return res.status(409).json({ error: 'this order is not ready for payment' });
    if (o.total_cents < STRIPE_MIN_CENTS) return res.status(409).json({ error: 'this order cannot be paid online, contact us' });
    const back = `${APP_URL}/merch/orders/${o.ref}?t=${mailToken(o)}`;
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      customer_email: o.buyer_email,
      line_items: [{
        price_data: { currency: String(o.currency || 'NZD').toLowerCase(), product_data: { name: `${productLabelOf(o)}, order ${o.ref}`.slice(0, 120) }, unit_amount: o.total_cents },
        quantity: 1,
      }],
      success_url: `${back}&paid=1`,
      cancel_url: back,
      metadata: { merch_order_ref: o.ref },
      payment_intent_data: { metadata: { merch_order_ref: o.ref } },
    }, { idempotencyKey: `merch-${o.id}-${o.total_cents}` });
    audit(req, 'merch.order.checkout', 'merch_order', o.id, { ref: o.ref, session: session.id });
    res.status(201).json({ data: { url: session.url } });
  }));

  // Admin: newest orders first, optionally one status.
  app.get('/admin/merch/orders', needRole('ADMIN'), asyncH(async (req, res) => {
    const status = String(req.query.status || '');
    const { rows } = await pool.query(
      `SELECT o.ref, o.status, o.delivery, o.product_id, o.quote->'product'->>'label' AS product_label, o.buyer_name, o.buyer_email,
         o.club_name, o.total_cents, o.created_at, o.updated_at,
         (SELECT COALESCE(SUM(qty), 0) FROM merch_order_lines l WHERE l.order_id = o.id)::INT AS units
       FROM merch_orders o WHERE ($1 = '' OR o.status = $1) ORDER BY o.created_at DESC LIMIT 200`,
      [ORDER_STATUSES.includes(status) ? status : '']);
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ data: rows });
  }));

  // Admin: next fulfilment step (in production, shipped with tracking,
  // delivered). Shipping emails the buyer.
  app.post('/admin/merch/orders/:ref/status', needRole('ADMIN'), asyncH(async (req, res) => {
    const ref = String(req.params.ref || '').toUpperCase();
    const o = REF_RE.test(ref) ? (await pool.query('SELECT * FROM merch_orders WHERE ref = $1', [ref])).rows[0] : null;
    if (!o) return res.status(404).json({ error: 'order not found' });
    const { to, note, error } = parseFulfilment(o.status, req.body);
    if (error) return res.status(409).json({ error });
    const client = await pool.connect();
    let moved;
    try {
      await client.query('BEGIN');
      moved = await client.query(
        'UPDATE merch_orders SET status = $2, updated_at = NOW() WHERE id = $1 AND status = $3 RETURNING id', [o.id, to, o.status]);
      if (moved.rowCount) {
        await client.query('INSERT INTO merch_order_events (order_id, status, note, actor_user_id) VALUES ($1, $2, $3, $4)',
          [o.id, to, note, req.authUser?.id || null]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    if (!moved.rowCount) return res.status(409).json({ error: 'the order changed, reload and try again' });
    let mailed = null;
    if (to === 'shipped') {
      mailed = true;
      try {
        const t = require('../lib/emailTemplates').merchOrderShipped({
          name: o.buyer_name, ref: o.ref, productLabel: productLabelOf(o), pickup: o.delivery === 'pickup',
          club: o.club_name, tracking: note, link: `${APP_URL}/merch/orders/${o.ref}?t=${mailToken(o)}`,
        });
        await require('../lib/mailer').sendMail({ to: o.buyer_email, subject: t.subject, text: t.text, html: t.html });
      } catch (e) {
        mailed = false;
        console.error('[merch.ship] buyer mail failed:', e.message);
      }
    }
    audit(req, `merch.order.${to}`, 'merch_order', o.id, { ref: o.ref });
    res.json({ data: { status: to, mailed } });
  }));

  // Admin: send a proof. The image is re-encoded to a JPEG (max 2400 px,
  // metadata stripped) and kept privately under the event's id. Allowed
  // until the buyer approves; sending again replaces the waiting proof.
  const proofUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: PROOF_MAX_BYTES, files: 1 } });
  app.post('/admin/merch/orders/:ref/proof', needRole('ADMIN'), proofUpload.single('proof'), asyncH(async (req, res) => {
    const ref = String(req.params.ref || '').toUpperCase();
    const o = REF_RE.test(ref) ? (await pool.query('SELECT * FROM merch_orders WHERE ref = $1', [ref])).rows[0] : null;
    if (!o) return res.status(404).json({ error: 'order not found' });
    if (!canSendProof(o.status)) return res.status(409).json({ error: `a proof cannot be sent while the order is ${o.status}` });
    const f = req.file;
    if (!f?.buffer?.length) return res.status(400).json({ error: 'choose a PNG, JPEG or WebP proof up to 15 MB' });
    const { fileTypeFromBuffer } = await import('file-type');
    const real = (await fileTypeFromBuffer(f.buffer).catch(() => null))?.mime || '';
    if (!PROOF_MIMES.includes(real)) return res.status(400).json({ error: 'proof must be a real PNG, JPEG or WebP image' });
    const jpeg = await require('sharp')(f.buffer).rotate()
      .resize(PROOF_MAX_PX, PROOF_MAX_PX, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }).jpeg({ quality: 86 }).toBuffer().catch(() => null);
    if (!jpeg) return res.status(400).json({ error: 'proof image could not be read' });
    const note = str(req.body?.note, NOTE_MAX) || null;

    const client = await pool.connect();
    let eventId;
    try {
      await client.query('BEGIN');
      const moved = await client.query(
        `UPDATE merch_orders SET status = 'proof_sent', updated_at = NOW() WHERE id = $1 AND status = ANY($2::TEXT[]) RETURNING id`,
        [o.id, PROOF_FROM]);
      if (!moved.rowCount) { const e = new Error('the order changed, reload and try again'); e.status = 409; throw e; }
      eventId = (await client.query(
        `INSERT INTO merch_order_events (order_id, status, note, actor_user_id) VALUES ($1, 'proof_sent', $2, $3) RETURNING id`,
        [o.id, note, req.authUser?.id || null])).rows[0].id;
      try {
        await mediaStore.putBuffer(proofKey(o.id, eventId), jpeg, 'image/jpeg');
      } catch {
        const e = new Error('proof storage unavailable, try again shortly'); e.status = 502; throw e;
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      if (e.status) return res.status(e.status).json({ error: e.message });
      throw e;
    } finally {
      client.release();
    }

    const token = mailToken(o);
    const link = `${APP_URL}/merch/orders/${o.ref}?t=${token}`;
    let mailed = true;
    try {
      const t = require('../lib/emailTemplates').merchProofReady({
        name: o.buyer_name, ref: o.ref, productLabel: o.quote?.product?.label || o.product_id, note, link,
        proofUrl: `${APP_URL}/api${proofPath(o.ref, eventId, token)}`,
      });
      await require('../lib/mailer').sendMail({ to: o.buyer_email, subject: t.subject, text: t.text, html: t.html });
    } catch (e) {
      mailed = false;
      console.error('[merch.proof] buyer mail failed:', e.message);
    }
    audit(req, 'merch.proof.send', 'merch_order', o.id, { ref: o.ref, event_id: String(eventId) });
    res.status(201).json({ data: { status: 'proof_sent', eventId: String(eventId), mailed } });
  }));

  app.get('/api/my/merch-orders', asyncH(async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: 'login required' });
    const { rows } = await pool.query(
      `SELECT o.ref, o.status, o.delivery, o.product_id, o.color, o.total_cents, o.created_at,
         (SELECT COALESCE(SUM(qty), 0) FROM merch_order_lines l WHERE l.order_id = o.id)::INT AS units
       FROM merch_orders o WHERE o.buyer_user_id = $1 ORDER BY o.created_at DESC LIMIT 50`,
      [req.authUser.id]);
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ data: rows });
  }));
};

module.exports.parseOrderInput = parseOrderInput;
module.exports.parseProofResponse = parseProofResponse;
module.exports.canSendProof = canSendProof;
module.exports.tokenOpens = tokenOpens;
module.exports.mailToken = mailToken;
module.exports.paymentProblem = paymentProblem;
module.exports.markMerchOrderPaid = markMerchOrderPaid;
module.exports.markMerchOrderRefunded = markMerchOrderRefunded;
module.exports.perItemSponsorCaps = perItemSponsorCaps;
module.exports.splitSponsorDiscount = splitSponsorDiscount;
module.exports.MERCH_BUDGET_LEFT_SQL = MERCH_BUDGET_LEFT_SQL;
module.exports.parseFulfilment = parseFulfilment;
