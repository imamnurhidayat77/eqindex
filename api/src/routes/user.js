const pool = require('../db');
const privacy = require('../privacy');
const { asyncH } = require('../lib/async');
const { needRole, needUser } = require('../lib/auth');
const { audit } = require('../lib/audit');
const { resolveId, UUID_RE } = require('../lib/resolve');
const multer = require('multer');
const mediaStore = require('../lib/mediaStore');

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});

// Ownership guard: a sponsor only touches their own profile (ADMIN exempt
// for support). Missing/inactive profile is 403, like ownPhotographerId.
async function ownSponsor(poolQ, authUser) {
  if (!authUser || authUser.role === 'ADMIN') return null;
  const { rows } = await poolQ.query(
    'SELECT id, name FROM sponsors WHERE user_id = $1 AND is_active', [authUser.id]);
  if (!rows.length) {
    const err = new Error('no sponsor profile — ask an admin to approve your application');
    err.status = 403; throw err;
  }
  return rows[0];
}

module.exports = function mountUserRoutes(app) {
  // Watchlist (entity_type: horse | rider | combination | event)
  app.get('/watchlist', asyncH(async (req, res) => {
    const uid = needUser(req, res); if (!uid) return;
    const { rows } = await pool.query(
      `SELECT w.*,
         COALESCE(h.slug, r.slug, ch.slug) AS slug,
         COALESCE(h.name, r.name, ev.name,
           ch.name || ' × ' || cr.name) AS name
       FROM watchlist_items w
       LEFT JOIN horses h ON (w.entity_type = 'horse' AND w.entity_id = h.id)
       LEFT JOIN riders r ON (w.entity_type = 'rider' AND w.entity_id = r.id)
       LEFT JOIN events ev ON (w.entity_type = 'event' AND w.entity_id = ev.id)
       LEFT JOIN horses ch ON (w.entity_type = 'combination' AND w.horse_id = ch.id)
       LEFT JOIN riders cr ON (w.entity_type = 'combination' AND w.rider_id = cr.id)
       WHERE w.user_id = $1 ORDER BY w.created_at DESC`,
      [uid]
    );
    res.json({ data: rows });
  }));

  app.post('/watchlist', asyncH(async (req, res) => {
    const uid = needUser(req, res); if (!uid) return;
    const { entity_type, entity_id, horse_id, rider_id, note, is_public } = req.body || {};
    const pub = !!is_public;
    if (!['horse', 'rider', 'combination', 'event'].includes(entity_type)) {
      return res.status(400).json({ error: 'need {entity_type: horse|rider|combination|event}' });
    }
    if (entity_type === 'combination') {
      if (!horse_id || !rider_id) {
        return res.status(400).json({ error: 'combination needs {horse_id, rider_id}' });
      }
      const hid = await resolveId('horses', horse_id, res);
      if (!hid) return;
      const rid = await resolveId('riders', rider_id, res);
      if (!rid) return;
      const ok = await pool.query(
        `SELECT (SELECT 1 FROM horses WHERE id = $1) AS h,
                (SELECT 1 FROM riders WHERE id = $2) AS r`, [hid, rid]);
      if (!ok.rows[0].h || !ok.rows[0].r) return res.status(404).json({ error: 'horse or rider not found' });
      const pair = await pool.query(
        'SELECT 1 FROM partnership_stats WHERE horse_id = $1 AND rider_id = $2', [hid, rid]);
      if (!pair.rows.length) return res.status(404).json({ error: 'pair has no rounds together' });
      const { rows } = await pool.query(
        `INSERT INTO watchlist_items (user_id, entity_type, horse_id, rider_id, note)
         VALUES ($1,'combination',$2,$3,$4)
         ON CONFLICT DO NOTHING RETURNING *`,
        [uid, hid, rid, note || null]
      );
      const row = rows[0] || (await pool.query(
        `SELECT * FROM watchlist_items WHERE user_id = $1 AND entity_type = 'combination'
         AND horse_id = $2 AND rider_id = $3`, [uid, hid, rid])).rows[0];
      audit(req, 'watchlist.add', 'combination', row.id, { horse_id: hid, rider_id: rid });
      return res.status(201).json({ data: row });
    }
    if (!entity_id) return res.status(400).json({ error: 'need entity_id' });
    const table = entity_type === 'horse' ? 'horses' : entity_type === 'rider' ? 'riders' : 'events';
    // Accept slugs too (profile pages route by slug) — resolve to UUID first.
    const resolved = await resolveId(table, entity_id, res);
    if (!resolved) return;
    const exists = await pool.query(`SELECT 1 FROM ${table} WHERE id = $1`, [resolved]);
    if (!exists.rows.length) return res.status(404).json({ error: `${entity_type} not found` });
    const { rows } = await pool.query(
      `INSERT INTO watchlist_items (user_id, entity_type, entity_id, note, is_public)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, entity_type, entity_id)
       WHERE entity_type IN ('horse','rider','event')
       DO UPDATE SET note = EXCLUDED.note, is_public = EXCLUDED.is_public RETURNING *`,
      [uid, entity_type, resolved, note || null, pub]
    );
    audit(req, 'watchlist.add', entity_type, rows[0].id, { entity_id: resolved });
    res.status(201).json({ data: rows[0] });
  }));

  app.delete('/watchlist/:id', asyncH(async (req, res) => {
    const uid = needUser(req, res); if (!uid) return;
    const { rowCount } = await pool.query(
      'DELETE FROM watchlist_items WHERE id = $1 AND user_id = $2', [req.params.id, uid]
    );
    if (!rowCount) return res.status(404).json({ error: 'not found' });
    audit(req, 'watchlist.remove', 'watchlist', req.params.id, {});
    res.json({ ok: true });
  }));

  app.patch('/watchlist/:id', asyncH(async (req, res) => {
    const uid = needUser(req, res); if (!uid) return;
    const { is_public, note } = req.body || {};
    const { rows } = await pool.query(
      `UPDATE watchlist_items SET is_public = COALESCE($3, is_public), note = COALESCE($4, note)
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, uid, is_public === undefined ? null : !!is_public, note === undefined ? null : note]);
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    audit(req, 'watchlist.edit', 'watchlist', req.params.id, { is_public: rows[0].is_public });
    res.json({ data: rows[0] });
  }));

  // Recent rounds from everything the user watches (powers Recent Updates).
  // ?days=30 (past rounds only), ?limit=50.
  app.get('/watchlist/updates', asyncH(async (req, res) => {
    const uid = needUser(req, res); if (!uid) return;
    const days = Math.min(Math.max(parseInt(req.query.days || '30', 10) || 30, 1), 365);
    const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 200);
    const { rows } = await pool.query(
      `SELECT rr.horse_id, rr.rider_id, h.name AS horse, r.name AS rider,
         e.name AS event, c.name AS class_name, c.class_date AS date,
         rr.total_faults AS faults, rr.clear_round AS clear, rr.finish_place AS place
       FROM round_results rr
       JOIN horses h ON h.id = rr.horse_id
       JOIN riders r ON r.id = rr.rider_id
       JOIN classes c ON c.id = rr.class_id
       JOIN events e ON e.id = rr.event_id
       WHERE c.class_date BETWEEN CURRENT_DATE - make_interval(days => $2::int) AND CURRENT_DATE
         AND (
           EXISTS (SELECT 1 FROM watchlist_items w WHERE w.user_id = $1
                   AND ((w.entity_type = 'horse' AND w.entity_id = rr.horse_id)
                     OR (w.entity_type = 'rider' AND w.entity_id = rr.rider_id)
                     OR (w.entity_type = 'combination' AND w.horse_id = rr.horse_id AND w.rider_id = rr.rider_id)
                     OR (w.entity_type = 'event' AND w.entity_id = rr.event_id)))
         )
       ORDER BY c.class_date DESC, rr.finish_place NULLS LAST LIMIT $3`,
      [uid, days, limit]
    );
    res.json({ data: rows });
  }));

  // Alert preferences (per-user toggles shown on the watchlist page)
  app.get('/alert-prefs', asyncH(async (req, res) => {
    const uid = needUser(req, res); if (!uid) return;
    const { rows } = await pool.query('SELECT * FROM alert_prefs WHERE user_id = $1', [uid]);
    res.json({
      data: rows[0] || {
        user_id: uid, score_changes: true, ranking_movements: true,
        new_results: true, benchmark_changes: false,
      },
    });
  }));

  app.put('/alert-prefs', asyncH(async (req, res) => {
    const uid = needUser(req, res); if (!uid) return;
    const { score_changes, ranking_movements, new_results, benchmark_changes } = req.body || {};
    const bit = (v, dflt) => (v === undefined || v === null ? dflt : !!v);
    const cur = await pool.query('SELECT * FROM alert_prefs WHERE user_id = $1', [uid]);
    const prev = cur.rows[0] || {};
    const vals = [
      bit(score_changes, prev.score_changes ?? true),
      bit(ranking_movements, prev.ranking_movements ?? true),
      bit(new_results, prev.new_results ?? true),
      bit(benchmark_changes, prev.benchmark_changes ?? false),
    ];
    const { rows } = await pool.query(
      `INSERT INTO alert_prefs (user_id, score_changes, ranking_movements, new_results, benchmark_changes)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id) DO UPDATE SET score_changes = EXCLUDED.score_changes,
         ranking_movements = EXCLUDED.ranking_movements, new_results = EXCLUDED.new_results,
         benchmark_changes = EXCLUDED.benchmark_changes, updated_at = NOW()
       RETURNING *`,
      [uid, ...vals]
    );
    res.json({ data: rows[0] });
  }));

  // Saved comparisons
  app.get('/comparisons', asyncH(async (req, res) => {
    const uid = needUser(req, res); if (!uid) return;
    const { rows } = await pool.query(
      'SELECT * FROM saved_comparisons WHERE user_id = $1 ORDER BY created_at DESC', [uid]
    );
    // resolve both sides from the stats views (names + metrics inline)
    const out = [];
    for (const sc of rows) {
      if (sc.type === 'combination') {
        const pick = async (id) => {
          const [h, r] = String(id).split(':');
          const s = await pool.query(
            'SELECT * FROM partnership_stats WHERE horse_id = $1 AND rider_id = $2', [h, r]);
          return s.rows[0] || null;
        };
        out.push({ ...sc, a: await pick(sc.a_id), b: await pick(sc.b_id) });
        continue;
      }
      const view = sc.type === 'horse' ? 'horse_stats' : 'rider_stats';
      const key = sc.type === 'horse' ? 'horse_id' : 'rider_id';
      const sides = await pool.query(`SELECT * FROM ${view} WHERE ${key} = ANY($1::uuid[])`, [[sc.a_id, sc.b_id]]);
      const byId = Object.fromEntries(sides.rows.map((r) => [r[key], r]));
      out.push({ ...sc, a: byId[sc.a_id] || null, b: byId[sc.b_id] || null });
    }
    res.json({ data: out });
  }));

  app.post('/comparisons', asyncH(async (req, res) => {
    const uid = needUser(req, res); if (!uid) return;
    const { type, a_id, b_id, label } = req.body || {};
    if (!['horse', 'rider', 'combination'].includes(type) || !a_id || !b_id || a_id === b_id) {
      return res.status(400).json({ error: 'need {type: horse|rider|combination, a_id, b_id} with a != b' });
    }
    const { rows } = await pool.query(
      'INSERT INTO saved_comparisons (user_id, type, a_id, b_id, label) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [uid, type, a_id, b_id, label || null]
    );
    audit(req, 'comparison.save', type, rows[0].id, { label });
    res.status(201).json({ data: rows[0] });
  }));

  app.delete('/comparisons/:id', asyncH(async (req, res) => {
    const uid = needUser(req, res); if (!uid) return;
    const { rowCount } = await pool.query(
      'DELETE FROM saved_comparisons WHERE id = $1 AND user_id = $2', [req.params.id, uid]
    );
    if (!rowCount) return res.status(404).json({ error: 'not found' });
    audit(req, 'comparison.remove', 'comparison', req.params.id, {});
    res.json({ ok: true });
  }));

  // ---- Rider claims (RIDER verifies ownership of a riders row) ----
  app.post('/riders/:id/claim', asyncH(async (req, res) => {
    req.params.id = await resolveId('riders', req.params.id, res);
    if (!req.params.id) return;
    if (!req.authUser) return res.status(401).json({ error: 'login required' });
    const rider = await pool.query('SELECT id FROM riders WHERE id = $1', [req.params.id]);
    if (!rider.rows.length) return res.status(404).json({ error: 'rider not found' });
    const { rows } = await pool.query(
      `INSERT INTO rider_claims (rider_id, user_id, note) VALUES ($1,$2,$3)
       ON CONFLICT (rider_id, user_id) DO UPDATE SET status='pending', note=EXCLUDED.note RETURNING *`,
      [req.params.id, req.authUser.id, (req.body || {}).note || null]);
    await pool.query("UPDATE riders SET claim_status='pending' WHERE id=$1 AND claim_status='unclaimed'", [req.params.id]);
    res.status(201).json({ data: rows[0] });
  }));

  // ---- Privacy opt-out (migration 033): verified riders toggle their own
  // visibility; horse owners theirs; admins either. Results stay counted.
  async function setVisibility(req, res, table, idCol, ownerCol, label) {
    if (!req.authUser) return res.status(401).json({ error: 'login required' });
    if (!(await privacy.privacyEnabled(pool))) {
      return res.status(503).json({ error: 'privacy controls not yet enabled (migration 033 pending)' });
    }
    const { visibility } = req.body || {};
    if (!['public', 'anonymous'].includes(visibility)) {
      return res.status(400).json({ error: "visibility must be 'public' or 'anonymous'" });
    }
    const cur = await pool.query(`SELECT ${ownerCol} AS owner FROM ${table} WHERE id = $1`, [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: `${label} not found` });
    if (req.authUser.role !== 'ADMIN' && cur.rows[0].owner !== req.authUser.id) {
      return res.status(403).json({ error: `only the verified ${label} or an admin can change visibility` });
    }
    await pool.query(`UPDATE ${table} SET visibility = $1 WHERE id = $2`, [visibility, req.params.id]);
    audit(req, `${label}.visibility`, table, req.params.id, { visibility });
    privacy.bustPrivacyCache();
    res.json({ ok: true, visibility });
  }

  app.post('/riders/:id/visibility', asyncH(async (req, res) => {
    req.params.id = await resolveId('riders', req.params.id, res);
    if (!req.params.id) return;
    return setVisibility(req, res, 'riders', 'id', 'user_id', 'rider');
  }));

  app.post('/horses/:id/visibility', asyncH(async (req, res) => {
    req.params.id = await resolveId('horses', req.params.id, res);
    if (!req.params.id) return;
    return setVisibility(req, res, 'horses', 'id', 'owner_id', 'horse');
  }));

  // ---- Coach roster ----
  app.get('/coach/athletes', needRole('COACH'), asyncH(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT r.* FROM coach_athletes ca JOIN riders r ON r.id = ca.rider_id
       WHERE ca.coach_user_id = $1 ORDER BY r.name`, [req.authUser.id]);
    // Privacy opt-out applies to coaches too (admins exempt).
    const sets = req.authUser?.role === 'ADMIN' ? null : await privacy.privacySets(pool);
    res.json({ data: rows.map((r) => privacy.maskRiderRow(r, sets)) });
  }));

  app.post('/coach/athletes', needRole('COACH'), asyncH(async (req, res) => {
    const { rider_id } = req.body || {};
    const r = await pool.query('SELECT id FROM riders WHERE id = $1', [rider_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'rider not found' });
    await pool.query('INSERT INTO coach_athletes (coach_user_id, rider_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [req.authUser.id, rider_id]);
    res.status(201).json({ ok: true });
  }));

  app.delete('/coach/athletes/:riderId', needRole('COACH'), asyncH(async (req, res) => {
    await pool.query('DELETE FROM coach_athletes WHERE coach_user_id=$1 AND rider_id=$2',
      [req.authUser.id, req.params.riderId]);
    res.json({ ok: true });
  }));

  // ---- Sponsor overview (own sponsor only — IDOR guard by session user) ----
  app.get('/sponsor/overview', needRole('SPONSOR'), asyncH(async (req, res) => {
    const s = await pool.query(
      'SELECT id, name, contact_email, website, is_active, created_at FROM sponsors WHERE user_id = $1 AND is_active ORDER BY created_at DESC LIMIT 1',
      [req.authUser.id]);
    if (!s.rows.length) return res.status(404).json({ error: 'no active sponsor profile — awaiting admin approval' });
    const sponsor = s.rows[0];
    const budgets = await pool.query(
      `SELECT b.id, b.agreed_cents, b.spent_cents, b.status, b.created_at,
        e.name AS event_name
       FROM sponsor_budgets b LEFT JOIN events e ON e.id = b.event_id
       WHERE b.sponsor_id = $1 ORDER BY b.created_at DESC LIMIT 50`, [sponsor.id]);
    const logos = await pool.query(
      `SELECT id, label, mime, bytes, is_active, created_at FROM sponsor_logos
       WHERE sponsor_id = $1 AND is_active ORDER BY created_at DESC LIMIT 50`, [sponsor.id]);
    const approvals = await pool.query(
      `SELECT a.id, a.status, a.created_at, a.decided_at, m.id AS media_id,
        l.label AS logo_label FROM logo_approvals a
       JOIN sponsor_logos l ON l.id = a.sponsor_logo_id
       LEFT JOIN media m ON m.id = a.media_id
       WHERE a.sponsor_id = $1 ORDER BY a.created_at DESC LIMIT 50`, [sponsor.id]);
    const gifts = await pool.query(
      `SELECT g.id, g.recipient_email, g.slots, g.cost_cents, g.created_at,
        b.status AS bundle_status FROM sponsor_gifts g
       JOIN credit_bundles b ON b.id = g.bundle_id
       JOIN sponsor_budgets bud ON bud.id = g.budget_id
       WHERE bud.sponsor_id = $1 ORDER BY g.created_at DESC LIMIT 50`, [sponsor.id]);
    res.json({ data: { sponsor, budgets: budgets.rows, logos: logos.rows, approvals: approvals.rows, gifts: gifts.rows } });
  }));

  // ---- Sponsor logo file (private preview for the dashboard <img>).
  app.get('/sponsor/logos/:id/file', needRole('SPONSOR'), asyncH(async (req, res) => {
    const sponsor = await ownSponsor(pool, req.authUser);
    if (!UUID_RE.test(String(req.params.id))) return res.status(400).json({ error: 'bad id' });
    const { rows } = await pool.query(
      'SELECT r2_key FROM sponsor_logos WHERE id = $1 AND sponsor_id = $2 AND is_active',
      [String(req.params.id), sponsor.id]);
    if (!rows.length || !rows[0].r2_key) return res.status(404).json({ error: 'logo not found' });
    res.setHeader('Cache-Control', 'private, no-store');
    res.redirect(303, await mediaStore.signedDownloadUrl(rows[0].r2_key, 300));
  }));

  // ---- Remove a logo (soft delete: past purchases keep their baked
  // files, but the logo leaves checkouts and the dashboard at once).
  app.delete('/sponsor/logos/:id', needRole('SPONSOR'), asyncH(async (req, res) => {
    const sponsor = await ownSponsor(pool, req.authUser);
    if (!UUID_RE.test(String(req.params.id))) return res.status(400).json({ error: 'bad id' });
    const { rows } = await pool.query(
      `UPDATE sponsor_logos SET is_active = false WHERE id = $1 AND sponsor_id = $2 AND is_active
       RETURNING id`,
      [String(req.params.id), sponsor.id]);
    if (!rows.length) return res.status(404).json({ error: 'logo not found' });
    audit(req, 'sponsor.logo.remove', 'sponsor', sponsor.id, { logo_id: rows[0].id });
    res.json({ ok: true });
  }));

  // ---- Sponsor discount setting (Option 2): per-photo discount in cents
  // for one of our own budgets. Checkout still enforces discount < price
  // and remaining funds, so this is safe to expose.
  app.patch('/sponsor/budgets/:id', needRole('SPONSOR'), asyncH(async (req, res) => {
    const sponsor = await ownSponsor(pool, req.authUser);
    if (!UUID_RE.test(String(req.params.id))) return res.status(400).json({ error: 'bad id' });
    const discount = Math.round(Number(req.body?.discount_cents));
    if (!Number.isFinite(discount) || discount < 0 || discount > 100000) {
      return res.status(400).json({ error: 'discount_cents must be 0–100000' });
    }
    const { rows } = await pool.query(
      `UPDATE sponsor_budgets SET discount_cents = $3 WHERE id = $1 AND sponsor_id = $2
       AND status = 'active' RETURNING id, discount_cents`,
      [String(req.params.id), sponsor.id, discount]);
    if (!rows.length) return res.status(404).json({ error: 'budget not found' });
    audit(req, 'sponsor.budget.discount', 'sponsor', sponsor.id, { budget_id: rows[0].id, discount_cents: discount });
    res.json({ data: rows[0] });
  }));

  // ---- Coverage report (who used our discounts): own budgets only.
  // Buyer emails are the coverage proof the sponsor pays for — same basis
  // as the photographer sales table.
  app.get('/sponsor/redemptions', needRole('SPONSOR'), asyncH(async (req, res) => {
    const sponsor = await ownSponsor(pool, req.authUser);
    const { rows } = await pool.query(
      `SELECT r.discount_cents, r.created_at,
        p.buyer_email, p.license_tier, p.amount_cents, p.original_amount_cents,
        COALESCE(h.name, '—') AS horse, COALESCE(rid.name, '—') AS rider,
        COALESCE(e.name, '—') AS event
       FROM sponsored_redemptions r
       JOIN purchases p ON p.id = r.purchase_id
       JOIN sponsor_budgets b ON b.id = r.budget_id
       LEFT JOIN media m ON m.id = p.media_id
       LEFT JOIN horses h ON h.id = m.horse_id
       LEFT JOIN riders rid ON rid.id = m.rider_id
       LEFT JOIN events e ON e.id = m.event_id
       WHERE b.sponsor_id = $1 ORDER BY r.created_at DESC LIMIT 100`,
      [sponsor.id]);
    res.json({ data: rows });
  }));

  // ---- Option 3: request permission to bake our logo into a photo.
  // The photo's photographer approves in the studio; the actual purchase
  // then goes through the normal Option 1 flow (no money moves here).
  app.post('/sponsor/approvals', needRole('SPONSOR'), asyncH(async (req, res) => {
    const sponsor = await ownSponsor(pool, req.authUser);
    const { media_id, sponsor_logo_id } = req.body || {};
    if (!UUID_RE.test(String(media_id || ''))) return res.status(400).json({ error: 'bad media_id' });
    if (!UUID_RE.test(String(sponsor_logo_id || ''))) return res.status(400).json({ error: 'bad sponsor_logo_id' });
    const m = await pool.query(`SELECT id, photographer_id FROM media WHERE id = $1 AND status = 'published'`, [String(media_id)]);
    if (!m.rows.length) return res.status(404).json({ error: 'photo not found or not for sale' });
    const l = await pool.query('SELECT id FROM sponsor_logos WHERE id = $1 AND sponsor_id = $2 AND is_active', [String(sponsor_logo_id), sponsor.id]);
    if (!l.rows.length) return res.status(404).json({ error: 'logo not found' });
    const dupe = await pool.query(
      `SELECT id FROM logo_approvals WHERE media_id = $1 AND sponsor_logo_id = $2 AND sponsor_id = $3 AND status = 'pending'`,
      [String(media_id), String(sponsor_logo_id), sponsor.id]);
    if (dupe.rows.length) return res.status(409).json({ error: 'request already pending', approval_id: dupe.rows[0].id });
    const ins = await pool.query(
      `INSERT INTO logo_approvals (media_id, sponsor_logo_id, sponsor_id) VALUES ($1, $2, $3) RETURNING id, status, created_at`,
      [String(media_id), String(sponsor_logo_id), sponsor.id]);
    audit(req, 'sponsor.approval.request', 'sponsor', sponsor.id, { approval_id: ins.rows[0].id, media_id: String(media_id) });
    res.status(201).json({ data: ins.rows[0] });
  }));

  // ---- PLUS 2: gift winner credits funded by a budget. One discount unit
  // per gifted slot comes off the budget immediately (same unit the
  // checkout ledger uses), so the fund can never overspend.
  const EMAIL_RE_SPONSOR = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  app.post('/sponsor/gifts', needRole('SPONSOR'), asyncH(async (req, res) => {
    const sponsor = await ownSponsor(pool, req.authUser);
    const { budget_id, pack_id, buyer_email, rider_id, horse_id } = req.body || {};
    if (!UUID_RE.test(String(budget_id || ''))) return res.status(400).json({ error: 'bad budget_id' });
    if (!UUID_RE.test(String(pack_id || ''))) return res.status(400).json({ error: 'bad pack_id' });
    const email = String(buyer_email || '').trim().toLowerCase();
    if (!EMAIL_RE_SPONSOR.test(email)) return res.status(400).json({ error: 'valid buyer_email required (winner claims by email)' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const b = await client.query(
        `SELECT * FROM sponsor_budgets WHERE id = $1 AND sponsor_id = $2 FOR UPDATE`, [String(budget_id), sponsor.id]);
      if (!b.rows.length || b.rows[0].status !== 'active') {
        await client.query('ROLLBACK'); return res.status(404).json({ error: 'budget not available' });
      }
      const bud = b.rows[0];
      const pk = await client.query(`SELECT * FROM credit_packs WHERE id = $1 AND status = 'published'`, [String(pack_id)]);
      if (!pk.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'credit pack not found' }); }
      const pack = pk.rows[0];
      if (bud.event_id && pack.event_id && bud.event_id !== pack.event_id) {
        await client.query('ROLLBACK'); return res.status(400).json({ error: 'pack event does not match budget event' });
      }
      const slots = Number(pack.slots) || 0;
      if (slots <= 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'pack has no slots' }); }
      const cost = slots * (Number(bud.discount_cents) || 0);
      const remaining = Number(bud.agreed_cents) - Number(bud.spent_cents);
      if (cost <= 0 || remaining < cost) {
        await client.query('ROLLBACK'); return res.status(409).json({ error: 'budget cannot cover this gift' });
      }
      const bundle = (await client.query(
        `INSERT INTO credit_bundles (pack_id, event_id, rider_id, horse_id, buyer_email, slots_total, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active') RETURNING id`,
        [pack.id, pack.event_id,
         rider_id && UUID_RE.test(String(rider_id)) ? String(rider_id) : (pack.rider_id || null),
         horse_id && UUID_RE.test(String(horse_id)) ? String(horse_id) : (pack.horse_id || null),
         email, slots])).rows[0];
      await client.query('UPDATE sponsor_budgets SET spent_cents = spent_cents + $2 WHERE id = $1', [bud.id, cost]);
      const gift = (await client.query(
        `INSERT INTO sponsor_gifts (budget_id, bundle_id, recipient_email, slots, cost_cents)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
        [bud.id, bundle.id, email, slots, cost])).rows[0];
      await client.query('COMMIT');
      audit(req, 'sponsor.gift', 'sponsor', sponsor.id, { gift_id: gift.id, bundle_id: bundle.id, cost_cents: cost });
      res.status(201).json({ data: { ...gift, bundle_id: bundle.id, slots, cost_cents: cost } });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }));

  // ---- Sponsor logo upload (PNG/JPEG ≤2MB, magic bytes sniffed).
  // Stored namespaced per sponsor; the row is what the shop reads.
  const LOGO_MIMES = ['image/png', 'image/jpeg'];
  app.post('/sponsor/logos', needRole('SPONSOR'), logoUpload.single('logo'), asyncH(async (req, res) => {
    const sponsor = await ownSponsor(pool, req.authUser);
    const label = String(req.body?.label || '').trim().slice(0, 100);
    if (!label) return res.status(400).json({ error: 'need {label} (brand name on the logo)' });
    const f = req.file;
    if (!f?.buffer?.length) return res.status(400).json({ error: 'need logo file (multipart, PNG/JPEG ≤2MB)' });
    const { fileTypeFromBuffer } = await import('file-type');
    const detected = await fileTypeFromBuffer(f.buffer).catch(() => null);
    const real = detected?.mime || '';
    // Prefer transparency-capable PNG; never trust the client MIME/extension.
    if (!LOGO_MIMES.includes(real)) {
      return res.status(400).json({ error: 'logo must be a real PNG or JPEG image' });
    }
    const ext = ((detected?.ext || 'png').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 8)) || 'png';
    const { rows } = await pool.query(
      `INSERT INTO sponsor_logos (sponsor_id, label, r2_key, mime, bytes)
       VALUES ($1, $2, '', $3, $4) RETURNING id`,
      [sponsor.id, label, real, f.buffer.length]
    );
    const id = rows[0].id;
    const key = `sponsors/${sponsor.id}/${id}.${ext}`;
    try {
      await mediaStore.putBuffer(key, f.buffer, real);
    } catch (e) {
      // Don't leave an orphan row when storage is down — the shop reads
      // this table, and a logo without bytes can never render.
      await pool.query('DELETE FROM sponsor_logos WHERE id = $1', [id]).catch(() => {});
      const err = new Error('logo storage unavailable — try again shortly');
      err.status = 502; throw err;
    }
    const done = (await pool.query(
      'UPDATE sponsor_logos SET r2_key = $2 WHERE id = $1 RETURNING id, label, mime, bytes, is_active, created_at',
      [id, key])).rows[0];
    audit(req, 'sponsor.logo.upload', 'sponsor', sponsor.id, { logo_id: id, label });
    res.status(201).json({ data: done });
  }));
};
