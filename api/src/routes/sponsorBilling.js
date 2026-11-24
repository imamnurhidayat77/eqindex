// Sponsor budgets are pre-agreed by an admin and billed to the sponsor
// afterwards (Charles, 2026-11-24). Admin-only: create/adjust budgets,
// see usage (discounts + gifts), cut a bill for everything not yet billed,
// mark a bill paid. Money moves outside the app (invoice from accounting).
const pool = require('../db');
const { asyncH } = require('../lib/async');
const { audit } = require('../lib/audit');
const { needRole } = require('../lib/auth');
const { UUID_RE } = require('../lib/resolve');
const { SPONSOR_BUDGET_KINDS } = require('../lib/wallet');

const MAX_BUDGET_CENTS = 10000000; // NZ$100k: anti-typo cap, not a business limit
const BUDGET_STATUSES = ['active', 'paused', 'closed'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Pure validation for create (all fields) and patch (only sent fields).
function parseBudgetInput(body, { partial = false } = {}) {
  const b = body || {};
  const out = {};
  const errors = [];
  const has = (k) => b[k] !== undefined;
  if (!partial || has('agreed_cents')) {
    const v = Number(b.agreed_cents);
    if (!Number.isInteger(v) || v < 1 || v > MAX_BUDGET_CENTS) errors.push('agreed_cents must be a whole number of cents, 1 to 10000000');
    else out.agreed_cents = v;
  }
  if (has('event_id') && !partial) {
    if (b.event_id === null || b.event_id === '') out.event_id = null;
    else if (!UUID_RE.test(String(b.event_id))) errors.push('event_id must be a UUID or empty');
    else out.event_id = String(b.event_id);
  }
  if (!partial) {
    const kind = b.applies_to === undefined || b.applies_to === '' ? 'photo' : b.applies_to;
    if (!SPONSOR_BUDGET_KINDS.includes(kind)) errors.push('applies_to must be photo or merch');
    else out.applies_to = kind;
  }
  if (has('ends_on')) {
    if (b.ends_on === null || b.ends_on === '') out.ends_on = null;
    else if (!DATE_RE.test(String(b.ends_on))) errors.push('ends_on must be YYYY-MM-DD');
    else out.ends_on = String(b.ends_on);
  }
  if (has('status')) {
    if (!BUDGET_STATUSES.includes(b.status)) errors.push('status must be active, paused or closed');
    else out.status = b.status;
  }
  if (has('note')) out.note = String(b.note || '').trim().slice(0, 300) || null;
  if (partial && !Object.keys(out).length && !errors.length) errors.push('nothing to update');
  return { values: out, errors };
}

// Unbilled usage of one budget: discounts given at checkout + gifts sent.
const USAGE_SQL = `
  SELECT 'discount' AS kind, r.purchase_id AS ref_id, r.discount_cents AS amount_cents, r.created_at, r.bill_id,
    p.buyer_email AS detail
  FROM sponsored_redemptions r JOIN purchases p ON p.id = r.purchase_id
  WHERE r.budget_id = $1
  UNION ALL
  SELECT 'gift' AS kind, g.id AS ref_id, g.cost_cents AS amount_cents, g.created_at, g.bill_id,
    g.recipient_email AS detail
  FROM sponsor_gifts g WHERE g.budget_id = $1`;

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  // Neutralise spreadsheet formulas, quote everything.
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

module.exports = function mountSponsorBillingRoutes(app) {
  app.get('/admin/sponsors/:id/budgets', needRole('ADMIN'), asyncH(async (req, res) => {
    if (!UUID_RE.test(String(req.params.id))) return res.status(400).json({ error: 'bad id' });
    const { rows } = await pool.query(
      `SELECT b.*, e.name AS event_name,
        COALESCE((SELECT SUM(discount_cents) FROM sponsored_redemptions WHERE budget_id = b.id AND bill_id IS NULL), 0)::INT
        + COALESCE((SELECT SUM(cost_cents) FROM sponsor_gifts WHERE budget_id = b.id AND bill_id IS NULL), 0)::INT AS unbilled_cents
       FROM sponsor_budgets b LEFT JOIN events e ON e.id = b.event_id
       WHERE b.sponsor_id = $1 ORDER BY b.created_at DESC`, [String(req.params.id)]);
    res.json({ data: rows });
  }));

  app.post('/admin/sponsors/:id/budgets', needRole('ADMIN'), asyncH(async (req, res) => {
    if (!UUID_RE.test(String(req.params.id))) return res.status(400).json({ error: 'bad id' });
    const { values, errors } = parseBudgetInput(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    const s = await pool.query(
      "SELECT id FROM sponsors WHERE id = $1 AND kind = 'official' AND is_active", [String(req.params.id)]);
    if (!s.rows.length) return res.status(404).json({ error: 'sponsor not found or inactive' });
    if (values.event_id) {
      const ev = await pool.query('SELECT id FROM events WHERE id = $1', [values.event_id]);
      if (!ev.rows.length) return res.status(404).json({ error: 'event not found' });
    }
    const { rows } = await pool.query(
      `INSERT INTO sponsor_budgets (sponsor_id, event_id, agreed_cents, ends_on, note, status, applies_to)
       VALUES ($1, $2, $3, $4, $5, 'active', $6) RETURNING *`,
      [String(req.params.id), values.event_id || null, values.agreed_cents, values.ends_on || null, values.note || null, values.applies_to]);
    audit(req, 'sponsor.budget.create', 'sponsor', String(req.params.id), { budget_id: rows[0].id, agreed_cents: values.agreed_cents, applies_to: values.applies_to });
    res.status(201).json({ data: rows[0] });
  }));

  app.patch('/admin/sponsor-budgets/:id', needRole('ADMIN'), asyncH(async (req, res) => {
    if (!UUID_RE.test(String(req.params.id))) return res.status(400).json({ error: 'bad id' });
    const { values, errors } = parseBudgetInput(req.body, { partial: true });
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    const cur = await pool.query('SELECT spent_cents FROM sponsor_budgets WHERE id = $1', [String(req.params.id)]);
    if (!cur.rows.length) return res.status(404).json({ error: 'budget not found' });
    if (values.agreed_cents !== undefined && values.agreed_cents < Number(cur.rows[0].spent_cents)) {
      return res.status(409).json({ error: 'agreed amount cannot be below what is already spent' });
    }
    const sets = [], vals = [];
    for (const [k, v] of Object.entries(values)) { vals.push(v); sets.push(`${k} = $${vals.length}`); }
    vals.push(String(req.params.id));
    const { rows } = await pool.query(
      `UPDATE sponsor_budgets SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
    audit(req, 'sponsor.budget.edit', 'sponsor', rows[0].sponsor_id, { budget_id: rows[0].id, ...values });
    res.json({ data: rows[0] });
  }));

  // Usage lines (newest first); ?format=csv downloads them for the invoice.
  app.get('/admin/sponsor-budgets/:id/usage', needRole('ADMIN'), asyncH(async (req, res) => {
    if (!UUID_RE.test(String(req.params.id))) return res.status(400).json({ error: 'bad id' });
    const { rows } = await pool.query(`${USAGE_SQL} ORDER BY created_at DESC LIMIT 5000`, [String(req.params.id)]);
    if (req.query.format === 'csv') {
      const lines = [['date', 'type', 'amount_nzd', 'recipient', 'bill_id'].map(csvCell).join(',')];
      for (const r of rows) {
        lines.push([new Date(r.created_at).toISOString(), r.kind, (Number(r.amount_cents) / 100).toFixed(2),
          r.detail, r.bill_id || 'unbilled'].map(csvCell).join(','));
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="sponsor-budget-${req.params.id}.csv"`);
      return res.send(lines.join('\n'));
    }
    res.json({ data: rows });
  }));

  // Cut a bill for everything not billed yet. Rows are locked so a sale
  // landing at the same moment is either in this bill or the next one.
  app.post('/admin/sponsor-budgets/:id/bills', needRole('ADMIN'), asyncH(async (req, res) => {
    if (!UUID_RE.test(String(req.params.id))) return res.status(400).json({ error: 'bad id' });
    const reference = String(req.body?.reference || '').trim().slice(0, 100) || null;
    const id = String(req.params.id);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const bud = await client.query('SELECT id, sponsor_id FROM sponsor_budgets WHERE id = $1 FOR UPDATE', [id]);
      if (!bud.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'budget not found' }); }
      const red = await client.query(
        'SELECT purchase_id, discount_cents, created_at FROM sponsored_redemptions WHERE budget_id = $1 AND bill_id IS NULL FOR UPDATE', [id]);
      const gifts = await client.query(
        'SELECT id, cost_cents, created_at FROM sponsor_gifts WHERE budget_id = $1 AND bill_id IS NULL FOR UPDATE', [id]);
      const all = [...red.rows.map((r) => ({ c: r.discount_cents, t: r.created_at })), ...gifts.rows.map((g) => ({ c: g.cost_cents, t: g.created_at }))];
      const amount = all.reduce((n, r) => n + Number(r.c || 0), 0);
      if (!all.length || amount <= 0) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'nothing to bill yet' }); }
      const times = all.map((r) => new Date(r.t).getTime());
      const bill = (await client.query(
        `INSERT INTO sponsor_bills (budget_id, amount_cents, items, period_from, period_to, reference, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [id, amount, all.length, new Date(Math.min(...times)), new Date(Math.max(...times)), reference, req.authUser.id])).rows[0];
      if (red.rows.length) {
        await client.query('UPDATE sponsored_redemptions SET bill_id = $1 WHERE purchase_id = ANY($2::UUID[])',
          [bill.id, red.rows.map((r) => r.purchase_id)]);
      }
      if (gifts.rows.length) {
        await client.query('UPDATE sponsor_gifts SET bill_id = $1 WHERE id = ANY($2::UUID[])',
          [bill.id, gifts.rows.map((g) => g.id)]);
      }
      await client.query('COMMIT');
      audit(req, 'sponsor.bill.create', 'sponsor', bud.rows[0].sponsor_id, { bill_id: bill.id, amount_cents: amount, items: all.length });
      res.status(201).json({ data: bill });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }));

  app.get('/admin/sponsor-bills', needRole('ADMIN'), asyncH(async (req, res) => {
    const bid = String(req.query.budget_id || '');
    if (!UUID_RE.test(bid)) return res.status(400).json({ error: 'need ?budget_id=' });
    const { rows } = await pool.query(
      'SELECT * FROM sponsor_bills WHERE budget_id = $1 ORDER BY created_at DESC LIMIT 100', [bid]);
    res.json({ data: rows });
  }));

  app.patch('/admin/sponsor-bills/:id', needRole('ADMIN'), asyncH(async (req, res) => {
    if (!UUID_RE.test(String(req.params.id))) return res.status(400).json({ error: 'bad id' });
    if (req.body?.status !== 'paid') return res.status(400).json({ error: "status must be 'paid'" });
    const { rows } = await pool.query(
      `UPDATE sponsor_bills SET status = 'paid', paid_at = NOW() WHERE id = $1 AND status = 'billed' RETURNING *`,
      [String(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: 'bill not found or already paid' });
    audit(req, 'sponsor.bill.paid', 'sponsor_bill', rows[0].id, { amount_cents: rows[0].amount_cents });
    res.json({ data: rows[0] });
  }));
};
module.exports.parseBudgetInput = parseBudgetInput;
