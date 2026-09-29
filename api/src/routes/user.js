const pool = require('../db');
const privacy = require('../privacy');
const { asyncH } = require('../lib/async');
const { needRole, needUser } = require('../lib/auth');
const { audit } = require('../lib/audit');
const { resolveId } = require('../lib/resolve');

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
      const ok = await pool.query(
        `SELECT (SELECT 1 FROM horses WHERE id = $1) AS h,
                (SELECT 1 FROM riders WHERE id = $2) AS r`, [horse_id, rider_id]);
      if (!ok.rows[0].h || !ok.rows[0].r) return res.status(404).json({ error: 'horse or rider not found' });
      const pair = await pool.query(
        'SELECT 1 FROM partnership_stats WHERE horse_id = $1 AND rider_id = $2', [horse_id, rider_id]);
      if (!pair.rows.length) return res.status(404).json({ error: 'pair has no rounds together' });
      const { rows } = await pool.query(
        `INSERT INTO watchlist_items (user_id, entity_type, horse_id, rider_id, note)
         VALUES ($1,'combination',$2,$3,$4)
         ON CONFLICT DO NOTHING RETURNING *`,
        [uid, horse_id, rider_id, note || null]
      );
      const row = rows[0] || (await pool.query(
        `SELECT * FROM watchlist_items WHERE user_id = $1 AND entity_type = 'combination'
         AND horse_id = $2 AND rider_id = $3`, [uid, horse_id, rider_id])).rows[0];
      audit(req, 'watchlist.add', 'combination', row.id, { horse_id, rider_id });
      return res.status(201).json({ data: row });
    }
    if (!entity_id) return res.status(400).json({ error: 'need entity_id' });
    const table = entity_type === 'horse' ? 'horses' : entity_type === 'rider' ? 'riders' : 'events';
    const exists = await pool.query(`SELECT 1 FROM ${table} WHERE id = $1`, [entity_id]);
    if (!exists.rows.length) return res.status(404).json({ error: `${entity_type} not found` });
    const { rows } = await pool.query(
      `INSERT INTO watchlist_items (user_id, entity_type, entity_id, note, is_public)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, entity_type, entity_id)
       WHERE entity_type IN ('horse','rider','event')
       DO UPDATE SET note = EXCLUDED.note, is_public = EXCLUDED.is_public RETURNING *`,
      [uid, entity_type, entity_id, note || null, pub]
    );
    audit(req, 'watchlist.add', entity_type, rows[0].id, { entity_id });
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
};
