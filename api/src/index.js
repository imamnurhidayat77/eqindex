require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('./db');

const app = express();
app.use(cors({
  origin: process.env.WEB_ORIGIN ? process.env.WEB_ORIGIN.split(',') : true,
  credentials: true,
}));
app.use(express.json());

// ---- Session auth (best practice: opaque token, sha256 at rest, httpOnly cookie) ----
const SESSION_COOKIE = 'eq_session';
const SESSION_DAYS = 30;
function getCookie(req, name) {
  const h = req.headers.cookie || '';
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
function setSessionCookie(req, res, token) {
  const secure = process.env.COOKIE_SECURE === '1' || req.secure;
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure, path: '/',
    maxAge: SESSION_DAYS * 24 * 3600 * 1000,
  });
}
async function sessionUser(req) {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.role FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`, [hash]);
  return rows[0] || null;
}
// attach once, before all routes
app.use(async (req, _res, next) => {
  try { req.authUser = await sessionUser(req); } catch { req.authUser = null; }
  next();
});
async function newSession(res, req, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, user_agent, ip, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + INTERVAL '30 days')`,
    [userId, hash, (req.headers['user-agent'] || '').slice(0, 200), (req.ip || '').slice(0, 60)]);
  setSessionCookie(req, res, token);
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const loginHits = new Map(); // ip -> {n, reset}
function throttled(ip) {
  const now = Date.now();
  const rec = loginHits.get(ip) || { n: 0, reset: now + 10 * 60e3 };
  if (now > rec.reset) { rec.n = 0; rec.reset = now + 10 * 60e3; }
  rec.n += 1; loginHits.set(ip, rec);
  return rec.n > 10;
}

function paging(req, def = 20, max = 100) {
  const limit = Math.min(parseInt(req.query.limit || def, 10) || def, max);
  const minStarts = Math.max(parseInt(req.query.min_starts || 0, 10) || 0, 0);
  return { limit, minStarts };
}

// Shared round-level filters: ?season=&region=&arena=&height_min=&height_max=&since=YYYY-MM-DD
// Aliases expected in query: rr (round_results), c (classes), e (events).
function roundFilters(q) {
  const conds = [], params = [];
  const push = (sql, v) => { params.push(v); conds.push(sql.replace('?', `$${params.length}`)); };
  if (q.season) push('e.season = ?', q.season);
  if (q.region) push('e.region = ?', q.region);
  if (q.arena) push('e.arena_type = ?', q.arena);
  if (q.height_min) push('COALESCE(rr.height_cm, c.height_cm) >= ?', Number(q.height_min));
  if (q.height_max) push('COALESCE(rr.height_cm, c.height_cm) <= ?', Number(q.height_max));
  if (q.since) push('c.class_date >= ?', q.since);
  return { clause: conds.length ? 'WHERE ' + conds.join(' AND ') : '', params };
}

const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get('/health', asyncH(async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
}));

// ---- Rankings (PRD §7.5) ----
app.get('/rankings/horses', asyncH(async (req, res) => {
  const { limit, minStarts } = paging(req);
  // Briefing §5 points mode: ?metric=points&window=all|12m|3m (views, pre-aggregated).
  if (req.query.metric === 'points') {
    const col = req.query.window === '12m' ? 'points_12m' : req.query.window === '3m' ? 'points_3m' : 'total_points';
    const { rows } = await pool.query(
      `SELECT p.horse_id, p.horse, p.total_starts AS starts, s.clears, s.clear_pct,
         s.avg_faults, s.faults_stddev, p.wins, p.podiums, p.win_rate,
         p.total_points, p.points_12m, p.points_3m, p.last_start
       FROM horse_point_stats p LEFT JOIN horse_stats s ON s.horse_id = p.horse_id
       WHERE p.total_starts >= $1
       ORDER BY p.${col} DESC, p.wins DESC, p.total_starts DESC LIMIT $2`,
      [minStarts, limit]
    );
    return res.json({ data: rows, metric: 'points', window: req.query.window || 'all' });
  }
  const f = roundFilters(req.query);
  const { rows } = await pool.query(
    `SELECT h.id AS horse_id, h.name AS horse, COUNT(*) AS starts,
       SUM(rr.clear_round::INT) AS clears,
       ROUND(100.0 * AVG(rr.clear_round::INT), 1) AS clear_pct,
       ROUND(AVG(rr.total_faults), 2) AS avg_faults,
       ROUND(STDDEV_POP(rr.total_faults), 2) AS faults_stddev,
       COUNT(*) FILTER (WHERE rr.finish_place = 1) AS wins,
       MIN(rr.finish_place) AS best_place, MAX(c.class_date) AS last_start
     FROM horses h
     JOIN round_results rr ON rr.horse_id = h.id
     JOIN classes c ON c.id = rr.class_id
     JOIN events e ON e.id = rr.event_id
     ${f.clause}
     GROUP BY h.id, h.name HAVING COUNT(*) >= ${minStarts}
     ORDER BY clear_pct DESC, avg_faults ASC, starts DESC LIMIT $${f.params.length + 1}`,
    [...f.params, limit]
  );
  res.json({ data: rows });
}));

app.get('/rankings/riders', asyncH(async (req, res) => {
  const { limit, minStarts } = paging(req);
  if (req.query.metric === 'points') {
    const col = req.query.window === '12m' ? 'points_12m' : req.query.window === '3m' ? 'points_3m' : 'total_points';
    const { rows } = await pool.query(
      `SELECT p.rider_id, p.rider, p.total_starts AS starts, s.clears, s.clear_pct,
         s.avg_faults, s.wins, s.horses_ridden, p.podiums, p.win_rate,
         p.total_points, p.points_12m, p.points_3m, p.last_start
       FROM rider_point_stats p LEFT JOIN rider_stats s ON s.rider_id = p.rider_id
       WHERE p.total_starts >= $1
       ORDER BY p.${col} DESC, p.wins DESC, p.total_starts DESC LIMIT $2`,
      [minStarts, limit]
    );
    return res.json({ data: rows, metric: 'points', window: req.query.window || 'all' });
  }
  const f = roundFilters(req.query);
  const { rows } = await pool.query(
    `SELECT r.id AS rider_id, r.name AS rider, COUNT(*) AS starts,
       SUM(rr.clear_round::INT) AS clears,
       ROUND(100.0 * AVG(rr.clear_round::INT), 1) AS clear_pct,
       ROUND(AVG(rr.total_faults), 2) AS avg_faults,
       COUNT(*) FILTER (WHERE rr.finish_place = 1) AS wins,
       COUNT(DISTINCT rr.horse_id) AS horses_ridden, MAX(c.class_date) AS last_start
     FROM riders r
     JOIN round_results rr ON rr.rider_id = r.id
     JOIN classes c ON c.id = rr.class_id
     JOIN events e ON e.id = rr.event_id
     ${f.clause}
     GROUP BY r.id, r.name HAVING COUNT(*) >= ${minStarts}
     ORDER BY clear_pct DESC, avg_faults ASC, starts DESC LIMIT $${f.params.length + 1}`,
    [...f.params, limit]
  );
  res.json({ data: rows });
}));

// ---- Events (PRD §7.3, §7.7) ----
app.get('/events', asyncH(async (req, res) => {
  const { limit } = paging(req);
  const conds = [], params = [];
  const push = (sql, v) => { params.push(v); conds.push(sql.replace('?', `$${params.length}`)); };
  if (req.query.season) push('e.season = ?', req.query.season);
  if (req.query.region) push('e.region = ?', req.query.region);
  if (req.query.arena) push('e.arena_type = ?', req.query.arena);
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const { rows } = await pool.query(
    `SELECT e.*,
       (SELECT COUNT(*)::INT FROM classes c WHERE c.event_id = e.id) AS class_count,
       (SELECT COUNT(*)::INT FROM round_results rr WHERE rr.event_id = e.id) AS round_count
     FROM events e ${where} ORDER BY e.date_start DESC LIMIT $${params.length + 1}`,
    [...params, limit]
  );
  res.json({ data: rows });
}));

app.get('/events/:id', asyncH(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM events WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'event not found' });
  const classes = await pool.query(
    'SELECT * FROM class_stats WHERE class_id IN (SELECT id FROM classes WHERE event_id = $1)',
    [req.params.id]
  );
  res.json({ data: rows[0], classes: classes.rows });
}));

// ---- Profiles ----
app.get('/horses/:id', asyncH(async (req, res) => {
  const horse = await pool.query('SELECT * FROM horses WHERE id = $1', [req.params.id]);
  if (!horse.rows.length) return res.status(404).json({ error: 'horse not found' });
  const stats = await pool.query('SELECT * FROM horse_stats WHERE horse_id = $1', [req.params.id]);
  const history = await pool.query(
    `SELECT rr.*, c.name AS class_name, e.name AS event_name, c.class_date, r.name AS rider
     FROM round_results rr
     JOIN classes c ON c.id = rr.class_id
     JOIN events e ON e.id = rr.event_id
     JOIN riders r ON r.id = rr.rider_id
     WHERE rr.horse_id = $1 ORDER BY c.class_date DESC NULLS LAST LIMIT 50`,
    [req.params.id]
  );
  const partners = await pool.query(
    'SELECT * FROM partnership_stats WHERE horse_id = $1 ORDER BY rounds_together DESC',
    [req.params.id]
  );
  res.json({ data: horse.rows[0], stats: stats.rows[0] || null, history: history.rows, partnerships: partners.rows });
}));

app.get('/riders/:id', asyncH(async (req, res) => {
  const rider = await pool.query('SELECT * FROM riders WHERE id = $1', [req.params.id]);
  if (!rider.rows.length) return res.status(404).json({ error: 'rider not found' });
  const stats = await pool.query('SELECT * FROM rider_stats WHERE rider_id = $1', [req.params.id]);
  const history = await pool.query(
    `SELECT rr.*, c.name AS class_name, e.name AS event_name, c.class_date, h.name AS horse
     FROM round_results rr
     JOIN classes c ON c.id = rr.class_id
     JOIN events e ON e.id = rr.event_id
     JOIN horses h ON h.id = rr.horse_id
     WHERE rr.rider_id = $1 ORDER BY c.class_date DESC NULLS LAST LIMIT 50`,
    [req.params.id]
  );
  const partners = await pool.query(
    'SELECT * FROM partnership_stats WHERE rider_id = $1 ORDER BY rounds_together DESC',
    [req.params.id]
  );
  res.json({ data: rider.rows[0], stats: stats.rows[0] || null, history: history.rows, partnerships: partners.rows });
}));

// ---- Stable-lite: training & health per horse ----
app.get('/horses/:id/training', asyncH(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT t.*, r.name AS rider FROM training_records t
     LEFT JOIN riders r ON r.id = t.rider_id
     WHERE t.horse_id = $1 ORDER BY t.date DESC LIMIT 50`, [req.params.id]);
  res.json({ data: rows });
}));

app.post('/horses/:id/training', asyncH(async (req, res) => {
  const { rider_id, date, type, intensity, notes } = req.body || {};
  if (!date || !type) return res.status(400).json({ error: 'need {date, type}' });
  if (intensity && !['Low', 'Medium', 'High'].includes(intensity)) {
    return res.status(400).json({ error: 'intensity must be Low|Medium|High' });
  }
  const horse = await pool.query('SELECT 1 FROM horses WHERE id = $1', [req.params.id]);
  if (!horse.rows.length) return res.status(404).json({ error: 'horse not found' });
  const { rows } = await pool.query(
    `INSERT INTO training_records (horse_id, rider_id, date, type, intensity, notes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.params.id, rider_id || null, date, type, intensity || null, notes || null]
  );
  audit(req, 'training.create', 'horse', req.params.id, { id: rows[0].id, type, date });
  res.status(201).json({ data: rows[0] });
}));

app.delete('/training/:id', asyncH(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM training_records WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'not found' });
  audit(req, 'training.delete', 'training', req.params.id, {});
  res.json({ ok: true });
}));

app.get('/horses/:id/health', asyncH(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM health_records WHERE horse_id = $1 ORDER BY date DESC LIMIT 50', [req.params.id]);
  res.json({ data: rows });
}));

app.post('/horses/:id/health', asyncH(async (req, res) => {
  const { date, category, description, provider } = req.body || {};
  if (!date || !category || !description) {
    return res.status(400).json({ error: 'need {date, category, description}' });
  }
  if (!['VET', 'TREATMENT', 'FARRIER', 'VACCINATION', 'OTHER'].includes(category)) {
    return res.status(400).json({ error: 'bad category' });
  }
  const horse = await pool.query('SELECT 1 FROM horses WHERE id = $1', [req.params.id]);
  if (!horse.rows.length) return res.status(404).json({ error: 'horse not found' });
  const { rows } = await pool.query(
    `INSERT INTO health_records (horse_id, date, category, description, provider)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.params.id, date, category, description, provider || null]
  );
  audit(req, 'health.create', 'horse', req.params.id, { id: rows[0].id, category, date });
  res.status(201).json({ data: rows[0] });
}));

app.delete('/health/:id', asyncH(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM health_records WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'not found' });
  audit(req, 'health.delete', 'health', req.params.id, {});
  res.json({ ok: true });
}));

// ---- Horse timeline: training + health + competition in one feed ----
app.get('/horses/:id/timeline', asyncH(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT date, kind, summary FROM (
       SELECT t.date, 'training' AS kind,
              t.type || COALESCE(' (' || t.intensity || ')', '') AS summary
       FROM training_records t WHERE t.horse_id = $1
       UNION ALL
       SELECT h.date, 'health' AS kind,
              h.category || ': ' || h.description AS summary
       FROM health_records h WHERE h.horse_id = $1
       UNION ALL
       SELECT c.class_date AS date, 'competition' AS kind,
              e.name || ' — ' || c.name || ': ' ||
              rr.total_faults || ' faults' ||
              CASE WHEN rr.clear_round THEN ' (clear)' ELSE '' END ||
              COALESCE(' #' || rr.finish_place, '') AS summary
       FROM round_results rr
       JOIN classes c ON c.id = rr.class_id
       JOIN events e ON e.id = rr.event_id
       WHERE rr.horse_id = $1
     ) t ORDER BY date DESC NULLS LAST LIMIT 100`,
    [req.params.id]
  );
  res.json({ data: rows });
}));

// ---- Review queue (naming curation) ----
app.get('/review', asyncH(async (req, res) => {
  const status = req.query.status || 'pending';
  if (!['pending', 'approved', 'merged', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'bad status' });
  }
  const { rows } = await pool.query(
    'SELECT * FROM review_queue WHERE status = $1 ORDER BY created_at', [status]);
  res.json({ data: rows });
}));

app.post('/review/:id', asyncH(async (req, res) => {
  const { action, match_id } = req.body || {};
  const q = await pool.query('SELECT * FROM review_queue WHERE id = $1', [req.params.id]);
  if (!q.rows.length) return res.status(404).json({ error: 'not found' });
  const item = q.rows[0];
  if (item.status !== 'pending') return res.status(409).json({ error: 'already resolved' });
  const table = item.kind === 'horse' ? 'horses' : 'riders';
  const aliasTable = item.kind === 'horse' ? 'horse_aliases' : 'rider_aliases';
  const fk = item.kind === 'horse' ? 'horse_id' : 'rider_id';

  if (action === 'approve_new') {
    const { rows } = await pool.query(
      `INSERT INTO ${table} (name, normalized_name) VALUES ($1,$2) RETURNING id`,
      [item.raw_name.trim(), item.normalized_name]
    );
    await pool.query("UPDATE review_queue SET status='approved', resolved_id=$2 WHERE id=$1",
      [item.id, rows[0].id]);
    audit(req, 'review.approve_new', item.kind, rows[0].id, { raw: item.raw_name });
    return res.json({ ok: true, status: 'approved', id: rows[0].id });
  }
  if (action === 'merge') {
    if (!match_id) return res.status(400).json({ error: 'need match_id' });
    const target = await pool.query(`SELECT 1 FROM ${table} WHERE id = $1`, [match_id]);
    if (!target.rows.length) return res.status(404).json({ error: 'match target not found' });
    await pool.query(
      `INSERT INTO ${aliasTable} (${fk}, alias, normalized_alias, source)
       VALUES ($1,$2,$3,$4) ON CONFLICT (normalized_alias, source) DO NOTHING`,
      [match_id, item.raw_name, item.normalized_name, item.source]
    );
    await pool.query("UPDATE review_queue SET status='merged', resolved_id=$2 WHERE id=$1",
      [item.id, match_id]);
    audit(req, 'review.merge', item.kind, match_id, { raw: item.raw_name });
    return res.json({ ok: true, status: 'merged' });
  }
  if (action === 'reject') {
    await pool.query("UPDATE review_queue SET status='rejected' WHERE id=$1", [item.id]);
    audit(req, 'review.reject', item.kind, item.id, { raw: item.raw_name });
    return res.json({ ok: true, status: 'rejected' });
  }
  return res.status(400).json({ error: 'action must be approve_new|merge|reject' });
}));

// ---- Comparison (PRD §7.8): /comparison?type=horse&a=<id>&b=<id> ----
// type=combination uses composite ids "horseId:riderId".
app.get('/comparison', asyncH(async (req, res) => {
  const { type, a, b } = req.query;
  if (!['horse', 'rider', 'combination'].includes(type) || !a || !b) {
    return res.status(400).json({ error: 'use ?type=horse|rider|combination&a=<id>&b=<id>' });
  }
  if (type === 'combination') {
    const pair = (s) => String(s).split(':');
    const [ah, ar] = pair(a), [bh, br] = pair(b);
    const { rows } = await pool.query(
      'SELECT * FROM partnership_stats WHERE (horse_id = $1 AND rider_id = $2) OR (horse_id = $3 AND rider_id = $4)',
      [ah, ar, bh, br]
    );
    if (rows.length < 2) return res.status(404).json({ error: 'one or both pairs not found' });
    const byId = Object.fromEntries(rows.map((r) => [`${r.horse_id}:${r.rider_id}`, r]));
    return res.json({ a: byId[`${ah}:${ar}`], b: byId[`${bh}:${br}`] });
  }
  const view = type === 'horse' ? 'horse_stats' : 'rider_stats';
  const key = type === 'horse' ? 'horse_id' : 'rider_id';
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(a) || !uuid.test(b)) {
    return res.status(404).json({ error: 'one or both ids not found' });
  }
  const { rows } = await pool.query(`SELECT * FROM ${view} WHERE ${key} = ANY($1::uuid[])`, [[a, b]]);
  if (rows.length < 2) return res.status(404).json({ error: 'one or both ids not found' });
  const byId = Object.fromEntries(rows.map((r) => [r[key], r]));
  res.json({ a: byId[a], b: byId[b] });
}));

app.get('/partnerships', asyncH(async (req, res) => {
  const { limit } = paging(req, 100);
  const { rows } = await pool.query(
    'SELECT * FROM partnership_stats ORDER BY rounds_together DESC, clear_pct DESC LIMIT $1',
    [limit]
  );
  res.json({ data: rows });
}));

// ---- Series standings (NZ series points, PRD §7.5) ----
app.get('/series', asyncH(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT series_key, series_name, event_name, season, COUNT(*)::INT AS entries
     FROM series_standings GROUP BY 1,2,3,4 ORDER BY event_name, series_name`
  );
  res.json({ data: rows });
}));

app.get('/series/:key/standings', asyncH(async (req, res) => {
  const { limit } = paging(req, 50);
  const { rows } = await pool.query(
    'SELECT * FROM series_rankings WHERE series_key = $1 ORDER BY rank LIMIT $2',
    [req.params.key, limit]
  );
  res.json({ data: rows });
}));

// ---- Trends (monthly aggregates for charts) ----
app.get('/trends/circuit', asyncH(async (req, res) => {
  const f = roundFilters(req.query);
  const { rows } = await pool.query(
    `SELECT to_char(date_trunc('month', c.class_date), 'Mon') AS month,
       date_trunc('month', c.class_date) AS m,
       COUNT(*)::INT AS starts,
       ROUND(100.0 * AVG(rr.clear_round::INT), 1) AS clear_pct,
       ROUND(AVG(rr.total_faults), 2) AS avg_faults,
       COUNT(DISTINCT rr.horse_id)::INT AS horses,
       COUNT(DISTINCT rr.rider_id)::INT AS riders,
       COUNT(DISTINCT rr.event_id)::INT AS events
     FROM round_results rr JOIN classes c ON c.id = rr.class_id
     JOIN events e ON e.id = rr.event_id
     ${f.clause ? f.clause + ' AND' : 'WHERE'} c.class_date IS NOT NULL
     GROUP BY 1, 2 ORDER BY 2`,
    f.params
  );
  res.json({ data: rows });
}));

app.get('/horses/:id/trend', asyncH(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT to_char(date_trunc('month', c.class_date), 'Mon') AS month,
       date_trunc('month', c.class_date) AS m,
       COUNT(*)::INT AS starts,
       ROUND(100.0 * AVG(rr.clear_round::INT), 1) AS clear_pct,
       ROUND(AVG(rr.total_faults), 2) AS avg_faults
     FROM round_results rr JOIN classes c ON c.id = rr.class_id
     WHERE rr.horse_id = $1 AND c.class_date IS NOT NULL
     GROUP BY 1, 2 ORDER BY 2`,
    [req.params.id]
  );
  res.json({ data: rows });
}));

// ---- Class difficulty + height progression (analytics page) ----
app.get('/classes', asyncH(async (req, res) => {
  const { limit } = paging(req, 50);
  const conds = [], params = [];
  const push = (sql, v) => { params.push(v); conds.push(sql.replace('?', `$${params.length}`)); };
  if (req.query.season) push('e.season = ?', req.query.season);
  if (req.query.region) push('e.region = ?', req.query.region);
  if (req.query.arena) push('e.arena_type = ?', req.query.arena);
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const { rows } = await pool.query(
    `SELECT cs.* FROM class_stats cs
     JOIN classes cl ON cl.id = cs.class_id JOIN events e ON e.id = cl.event_id
     ${where} ORDER BY cs.avg_faults DESC NULLS LAST LIMIT $${params.length + 1}`,
    [...params, limit]
  );
  res.json({ data: rows });
}));

app.get('/height-stats', asyncH(async (req, res) => {
  const { limit } = paging(req, 50);
  const { rows } = await pool.query(
    'SELECT * FROM horse_height_stats ORDER BY height_cm, clear_pct DESC LIMIT $1', [limit]);
  res.json({ data: rows });
}));

// ---- Event analytics bundle (one call for the event intelligence page) ----
app.get('/events/:id/analytics', asyncH(async (req, res) => {
  const ev = await pool.query('SELECT * FROM events WHERE id = $1', [req.params.id]);
  if (!ev.rows.length) return res.status(404).json({ error: 'event not found' });
  const e = ev.rows[0];
  const classes = await pool.query(
    'SELECT * FROM class_stats WHERE class_id IN (SELECT id FROM classes WHERE event_id = $1)',
    [e.id]
  );
  const rounds = await pool.query(
    `SELECT rr.*, h.name AS horse, r.name AS rider, c.name AS class_name,
       c.class_date, COALESCE(rr.height_cm, c.height_cm) AS height_cm
     FROM round_results rr
     JOIN horses h ON h.id = rr.horse_id
     JOIN riders r ON r.id = rr.rider_id
     JOIN classes c ON c.id = rr.class_id
     WHERE rr.event_id = $1
     ORDER BY c.class_date, c.name, rr.finish_place NULLS LAST`,
    [e.id]
  );
  const horses = await pool.query(
    `SELECT DISTINCT ON (rr.horse_id) h.id AS horse_id, h.name AS horse,
       r.name AS rider, r.id AS rider_id,
       COALESCE(rr.height_cm, c.height_cm) AS height_cm,
       rr.jump_faults, rr.time_seconds, rr.finish_place
     FROM round_results rr
     JOIN horses h ON h.id = rr.horse_id
     JOIN riders r ON r.id = rr.rider_id
     JOIN classes c ON c.id = rr.class_id
     WHERE rr.event_id = $1
     ORDER BY rr.horse_id, rr.finish_place NULLS LAST, rr.total_faults, rr.time_seconds NULLS LAST
     LIMIT 5`,
    [e.id]
  );
  const riders = await pool.query(
    `SELECT r.id AS rider_id, r.name AS rider, COUNT(*)::INT AS starts,
       COUNT(DISTINCT rr.horse_id)::INT AS horses_ridden,
       ROUND(100.0 * AVG(rr.clear_round::INT), 1) AS clear_pct,
       ROUND(AVG(rr.total_faults), 2) AS avg_faults
     FROM round_results rr JOIN riders r ON r.id = rr.rider_id
     WHERE rr.event_id = $1
     GROUP BY r.id, r.name ORDER BY clear_pct DESC NULLS LAST, avg_faults ASC LIMIT 5`,
    [e.id]
  );
  const partnerships = await pool.query(
    `SELECT h.name AS horse, r.name AS rider, COUNT(*)::INT AS rounds,
       ROUND(100.0 * AVG(rr.clear_round::INT), 1) AS clear_pct,
       ROUND(AVG(rr.total_faults), 2) AS avg_faults,
       MIN(rr.finish_place) AS best_place
     FROM round_results rr
     JOIN horses h ON h.id = rr.horse_id
     JOIN riders r ON r.id = rr.rider_id
     WHERE rr.event_id = $1
     GROUP BY h.name, r.name ORDER BY clear_pct DESC, avg_faults ASC LIMIT 5`,
    [e.id]
  );
  const weather = await pool.query(
    `SELECT * FROM weather_cache WHERE venue_norm = lower(trim($1))
     ORDER BY date`,
    [e.venue]
  );
  res.json({
    event: e, classes: classes.rows, rounds: rounds.rows,
    horses: horses.rows, riders: riders.rows, partnerships: partnerships.rows,
    weather: weather.rows,
  });
}));

// ---- Arena aggregates (surface intelligence) ----
app.get('/arenas', asyncH(async (req, res) => {
  const { rows } = await pool.query(
    `WITH a AS (
       SELECT e.arena_type AS arena, COUNT(*)::INT AS rounds,
         ROUND(100.0 * AVG(rr.clear_round::INT), 1) AS clear_pct,
         ROUND(AVG(rr.total_faults), 2) AS avg_faults
       FROM round_results rr JOIN events e ON e.id = rr.event_id
       WHERE e.arena_type IS NOT NULL GROUP BY 1
     ),
     top AS (
       SELECT DISTINCT ON (e.arena_type) e.arena_type AS arena, h.name AS horse
       FROM round_results rr
       JOIN events e ON e.id = rr.event_id
       JOIN horses h ON h.id = rr.horse_id
       WHERE e.arena_type IS NOT NULL
       GROUP BY e.arena_type, h.id, h.name HAVING COUNT(*) >= 3
       ORDER BY e.arena_type, AVG(rr.clear_round::INT) DESC
     )
     SELECT a.*, t.horse AS top_horse FROM a
     LEFT JOIN top t ON t.arena = a.arena ORDER BY a.rounds DESC`
  );
  res.json({ data: rows });
}));

// ---- Elite MVP: user scope via ?user_id= or X-User-Id header (full auth later) ----
function userId(req) {
  return (req.authUser && req.authUser.id) || req.query.user_id || req.headers['x-user-id'] || null;
}
// ---- Audit trail (spec v2 §11): every material change logged, never blocking ----
async function audit(req, action, entity_type, entity_id, detail) {
  try {
    const actor = req.authUser ? `${req.authUser.name} <${req.authUser.id}>`
      : (req.body && req.body.user_id) || req.query.user_id || 'anonymous';
    await pool.query(
      'INSERT INTO entity_audit (actor, action, entity_type, entity_id, detail) VALUES ($1,$2,$3,$4,$5)',
      [String(actor).slice(0, 200), action, entity_type, entity_id ? String(entity_id).slice(0, 120) : null, JSON.stringify(detail || {})]);
  } catch { /* audit must never break the request */ }
}

function needRole(role) {
  return async (req, res, next) => {
    if (!req.authUser) return res.status(401).json({ error: 'login required' });
    if (req.authUser.role !== role && req.authUser.role !== 'ADMIN') {
      return res.status(403).json({ error: `${role} role required` });
    }
    next();
  };
}
function needUser(req, res) {
  const id = userId(req);
  if (!id) { res.status(401).json({ error: 'user_id required (query or X-User-Id)' }); return null; }
  return id;
}

// Watchlist (entity_type: horse | rider | combination | event)
app.get('/watchlist', asyncH(async (req, res) => {
  const uid = needUser(req, res); if (!uid) return;
  const { rows } = await pool.query(
    `SELECT w.*,
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
  const { user_id, entity_type, entity_id, horse_id, rider_id, note, is_public } = req.body || {};
  const pub = !!is_public;
  if (!user_id || !['horse', 'rider', 'combination', 'event'].includes(entity_type)) {
    return res.status(400).json({ error: 'need {user_id, entity_type: horse|rider|combination|event}' });
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
      [user_id, horse_id, rider_id, note || null]
    );
    const row = rows[0] || (await pool.query(
      `SELECT * FROM watchlist_items WHERE user_id = $1 AND entity_type = 'combination'
       AND horse_id = $2 AND rider_id = $3`, [user_id, horse_id, rider_id])).rows[0];
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
    [user_id, entity_type, entity_id, note || null, pub]
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
  const { user_id, score_changes, ranking_movements, new_results, benchmark_changes } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'need {user_id, ...prefs}' });
  const bit = (v, dflt) => (v === undefined || v === null ? dflt : !!v);
  const cur = await pool.query('SELECT * FROM alert_prefs WHERE user_id = $1', [user_id]);
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
    [user_id, ...vals]
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
  const { user_id, type, a_id, b_id, label } = req.body || {};
  if (!user_id || !['horse', 'rider', 'combination'].includes(type) || !a_id || !b_id || a_id === b_id) {
    return res.status(400).json({ error: 'need {user_id, type: horse|rider|combination, a_id, b_id} with a != b' });
  }
  const { rows } = await pool.query(
    'INSERT INTO saved_comparisons (user_id, type, a_id, b_id, label) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [user_id, type, a_id, b_id, label || null]
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


// ---- Auth: register / login / logout / me ----
app.post('/auth/register', asyncH(async (req, res) => {
  const { name, email, password, role } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!name || !String(name).trim() || !EMAIL_RE.test(cleanEmail)) {
    return res.status(400).json({ error: 'need {name, valid email}' });
  }
  if (!password || String(password).length < 8 || String(password).length > 72) {
    return res.status(400).json({ error: 'password must be 8-72 chars' });
  }
  const wantRole = ['PUBLIC', 'RIDER', 'COACH'].includes(role) ? role : 'PUBLIC';
  const exists = await pool.query('SELECT 1 FROM users WHERE email = $1', [cleanEmail]);
  if (exists.rows.length) return res.status(409).json({ error: 'email already registered' });
  const hash = await bcrypt.hash(String(password), 12);
  const { rows } = await pool.query(
    'INSERT INTO users (name, email, role, password_hash) VALUES ($1,$2,$3,$4) RETURNING id, name, email, role',
    [String(name).trim().slice(0, 100), cleanEmail, wantRole, hash]);
  await newSession(res, req, rows[0].id);
  res.status(201).json({ data: rows[0] });
}));

app.post('/auth/login', asyncH(async (req, res) => {
  if (throttled(req.ip || 'x')) return res.status(429).json({ error: 'too many attempts, try later' });
  const { email, password } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [cleanEmail]);
  const u = rows[0];
  const ok = u && u.password_hash && await bcrypt.compare(String(password || ''), u.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid email or password' });
  await newSession(res, req, u.id);
  res.json({ data: { id: u.id, name: u.name, email: u.email, role: u.role } });
}));

app.post('/auth/logout', asyncH(async (req, res) => {
  const token = getCookie(req, SESSION_COOKIE);
  if (token) {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hash]);
  }
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
}));

app.get('/auth/me', asyncH(async (req, res) => {
  if (!req.authUser) return res.status(401).json({ error: 'not logged in' });
  res.json({ data: req.authUser });
}));

// ---- Rider claims (RIDER verifies ownership of a riders row) ----
app.post('/riders/:id/claim', asyncH(async (req, res) => {
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

app.get('/claims', needRole('ADMIN'), asyncH(async (req, res) => {
  const status = req.query.status || 'pending';
  const { rows } = await pool.query(
    `SELECT c.*, r.name AS rider, u.name AS claimant FROM rider_claims c
     JOIN riders r ON r.id = c.rider_id JOIN users u ON u.id = c.user_id
     WHERE c.status = $1 ORDER BY c.created_at`, [status]);
  res.json({ data: rows });
}));

app.post('/claims/:id', needRole('ADMIN'), asyncH(async (req, res) => {
  const { approve } = req.body || {};
  const q = await pool.query('SELECT * FROM rider_claims WHERE id = $1', [req.params.id]);
  if (!q.rows.length) return res.status(404).json({ error: 'not found' });
  const c = q.rows[0];
  if (approve) {
    await pool.query("UPDATE rider_claims SET status='approved' WHERE id=$1", [c.id]);
    audit(req, 'claim.approve', 'rider', c.rider_id, { user: c.user_id });
    await pool.query('UPDATE riders SET user_id=$2, claim_status=$3 WHERE id=$1', [c.rider_id, c.user_id, 'verified']);
  } else {
    await pool.query("UPDATE rider_claims SET status='rejected' WHERE id=$1", [c.id]);
    audit(req, 'claim.reject', 'rider', c.rider_id, { user: c.user_id });
    await pool.query("UPDATE riders SET claim_status='unclaimed' WHERE id=$1 AND user_id IS NULL", [c.rider_id]);
  }
  res.json({ ok: true, approved: !!approve });
}));

// ---- Coach roster ----
app.get('/coach/athletes', needRole('COACH'), asyncH(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT r.* FROM coach_athletes ca JOIN riders r ON r.id = ca.rider_id
     WHERE ca.coach_user_id = $1 ORDER BY r.name`, [req.authUser.id]);
  res.json({ data: rows });
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

// ---- Audit activity feed (admin) ----
app.get('/admin/activity', needRole('ADMIN'), asyncH(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 200);
  const conds = [], params = [];
  if (req.query.action) { params.push(req.query.action); conds.push(`action = $${params.length}`); }
  if (req.query.entity) { params.push(req.query.entity); conds.push(`entity_type = $${params.length}`); }
  params.push(limit);
  const { rows } = await pool.query(
    `SELECT * FROM entity_audit ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
     ORDER BY created_at DESC LIMIT $${params.length}`, params);
  res.json({ data: rows });
}));

// ---- Weather cache (measured service data; estimates labelled) ----
app.get('/weather', asyncH(async (req, res) => {
  const { venue, from, to } = req.query;
  const conds = [], params = [];
  if (venue) { params.push(venue); conds.push(`venue_norm = lower(trim($${params.length}))`); }
  if (from) { params.push(from); conds.push(`date >= $${params.length}`); }
  if (to) { params.push(to); conds.push(`date <= $${params.length}`); }
  const { rows } = await pool.query(
    `SELECT * FROM weather_cache ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''} ORDER BY date LIMIT 200`, params);
  res.json({ data: rows });
}));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[api]', err.message);
  res.status(500).json({ error: 'internal error' });
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`[api] listening on :${port}`));
