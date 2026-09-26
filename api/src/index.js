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
  if (req.authUser) return res.status(409).json({ error: 'already logged in — log out first' });
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
  if (req.authUser) return res.status(409).json({ error: 'already logged in — log out first' });
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


// ---- Admin CSV import (spec §8A): paste/upload → validate → preview → commit.
// Body: { event_id?, event?: {name,date_start,date_end,venue,region,arena_type},
//         csv, filename?, source?, dry_run? }
// Header vocab (case-insensitive): class_name|class, class_type, class_date,
// rider_name|rider, horse_name|horse, placing|finish_place, faults|jump_faults,
// time|time_seconds, time_faults, height_cm, status (finished|E|R|W|DQ...), notes.
// dry_run runs the SAME writes inside a rolled-back transaction: preview points
// come from the real trigger, never a duplicated formula.
function normName(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}
function parseCsv(text) {
  const rows = [];
  let cur = [''], q = false;
  const push = () => { rows.push(cur); cur = ['']; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur[cur.length - 1] += '"'; i++; } else q = false; }
      else cur[cur.length - 1] += c;
    } else if (c === '"') q = true;
    else if (c === ',') cur.push('');
    else if (c === '\n') push();
    else if (c === '\r') { /* skip */ }
    else cur[cur.length - 1] += c;
  }
  if (cur.length > 1 || cur[0] !== '') push();
  return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
}
const CLASS_TYPES = ['Grand Prix', 'Premier', 'Open', 'Standard', 'Young Horse', 'Amateur', 'Pony'];
const STATUS_MAP = { E: 'eliminated', R: 'retired', W: 'withdrawn', DQ: 'disqualified', ELIM: 'eliminated', RET: 'retired', WD: 'withdrawn' };

// Canonical import record (JSON mode uses these exact keys; CSV headers map to them).
const IMPORT_FIELDS = ['class_name', 'class_type', 'class_date', 'rider_name', 'horse_name',
  'placing', 'faults', 'time', 'time_faults', 'height_cm', 'status', 'notes', 'series_key'];

app.post('/admin/import', needRole('ADMIN'), asyncH(async (req, res) => {
  const { event_id, event, csv, records, filename, source, dry_run } = req.body || {};
  const src = ['CSV', 'MANUAL', 'ESNZ', 'EQUIPE', 'FEI'].includes(source) ? source : 'CSV';
  let grid, head;
  if (Array.isArray(records)) {
    if (!records.length) return res.status(400).json({ error: 'records is empty' });
    const keys = [...new Set(records.flatMap((r) => Object.keys(r || {})))];
    const normKey = (k) => String(k).trim().toLowerCase().replace(/\s+/g, '_');
    head = keys.map(normKey);
    grid = [head, ...records.map((r) => head.map((_, i) => {
      const orig = keys[i];
      const v = r[orig];
      return v === null || v === undefined ? '' : String(v);
    }))];
  } else {
    if (!csv || typeof csv !== 'string' || !csv.trim()) {
      return res.status(400).json({ error: 'need {csv} text or {records} array' });
    }
    grid = parseCsv(csv.trim());
    if (grid.length < 2) return res.status(400).json({ error: 'csv needs a header row + data' });
    head = grid[0].map((h) => String(h).trim().toLowerCase().replace(/\s+/g, '_'));
  }
  const col = (...names) => { const i = head.findIndex((h) => names.includes(h)); return i; };
  const ci = {
    cls: col('class_name', 'class'), ctype: col('class_type'), cdate: col('class_date', 'date'),
    rider: col('rider_name', 'rider'), horse: col('horse_name', 'horse'),
    place: col('placing', 'finish_place', 'place'), faults: col('faults', 'jump_faults'),
    time: col('time', 'time_seconds'), tfaults: col('time_faults'), height: col('height_cm', 'height'),
    status: col('status'), notes: col('notes'),
  };
  ci.series = col('series_key', 'series');
  for (const k of ['cls', 'rider', 'horse']) {
    if (ci[k] < 0) return res.status(400).json({ error: `missing required column for ${k} (class_name, rider_name, horse_name)` });
  }
  const num = (v) => { const t = String(v ?? '').trim(); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : NaN; };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let evId = event_id || null;
    const ensureVenue = async (name, region) => {
      if (!name) return null;
      const nn = String(name).trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
      if (!nn) return null;
      let v = (await client.query('SELECT id FROM venues WHERE normalized_name = $1', [nn])).rows[0];
      if (!v) {
        v = (await client.query('INSERT INTO venues (name, normalized_name, region) VALUES ($1,$2,$3) RETURNING id',
          [String(name).trim(), nn, region || null])).rows[0];
      }
      return v.id;
    };
    if (!evId && event && event.name && event.date_start) {
      const ex = await client.query('SELECT id FROM events WHERE name = $1 AND date_start = $2', [event.name, event.date_start]);
      if (ex.rows.length) evId = ex.rows[0].id;
      else {
        const season = (() => { const y = Number(String(event.date_start).slice(0, 4)); const m = Number(String(event.date_start).slice(5, 7)); return m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`; })();
        const ins = await client.query(
          `INSERT INTO events (name, date_start, date_end, venue, region, arena_type, season, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'MANUAL') RETURNING id`,
          [event.name, event.date_start, event.date_end || event.date_start, event.venue || 'Unknown',
           event.region || null, event.arena_type || null, season]);
        evId = ins.rows[0].id;
      }
    }
    if (!evId) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'need event_id or event{name,date_start}' }); }
    const evRow = (await client.query('SELECT season, venue, region, venue_id FROM events WHERE id = $1', [evId])).rows[0];
    if (!evRow) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'event not found' }); }
    if (!evRow.venue_id) {
      const vid = await ensureVenue(evRow.venue, evRow.region);
      if (vid) await client.query('UPDATE events SET venue_id = $2 WHERE id = $1', [evId, vid]);
    }

    const out = [];
    let okCount = 0;
    for (let li = 1; li < grid.length; li++) {
      const r = grid[li];
      const g = (i) => (i < 0 ? '' : String(r[i] ?? '').trim());
      const errs = [];
      const rider = g(ci.rider), horse = g(ci.horse), cls = g(ci.cls);
      if (!rider) errs.push('rider_name required');
      if (!horse) errs.push('horse_name required');
      if (!cls) errs.push('class_name required');
      let ctype = g(ci.ctype) || 'Standard';
      if (!CLASS_TYPES.includes(ctype)) errs.push(`class_type must be ${CLASS_TYPES.join('|')}`);
      const place = g(ci.place) === '' ? null : parseInt(g(ci.place), 10);
      if (g(ci.place) !== '' && !(place >= 1)) errs.push('placing must be a positive integer');
      const faults = num(g(ci.faults)); const tsec = num(g(ci.time));
      const tf = num(g(ci.tfaults)); const hcm = num(g(ci.height));
      for (const [v, n] of [[faults, 'faults'], [tsec, 'time'], [tf, 'time_faults'], [hcm, 'height_cm']]) {
        if (v !== null && (typeof v !== 'number' || Number.isNaN(v))) errs.push(`${n} must be numeric`);
      }
      let status = 'finished';
      const stRaw = g(ci.status).toUpperCase();
      if (stRaw) {
        if (['FINISHED', 'E', 'R', 'W', 'DQ', 'ELIM', 'RET', 'WD', 'ELIMINATED', 'RETIRED', 'WITHDRAWN', 'DISQUALIFIED'].includes(stRaw)) {
          status = STATUS_MAP[stRaw] || 'finished';
        } else errs.push('status must be finished|E|R|W|DQ');
      }
      const cdate = g(ci.cdate) || null;
      if (cdate && !/^\d{4}-\d{2}-\d{2}$/.test(cdate)) errs.push('class_date must be YYYY-MM-DD');
      if (errs.length) { out.push({ line: li + 1, ok: false, errors: errs }); continue; }

      // identity (mirrors ingest/normalize.py)
      const rn = normName(rider), hn = normName(horse);
      let hRow = (await client.query('SELECT id FROM horses WHERE normalized_name = $1', [hn])).rows[0];
      let rRow = (await client.query('SELECT id FROM riders WHERE normalized_name = $1', [rn])).rows[0];
      const newHorse = !hRow, newRider = !rRow;
      if (!hRow) hRow = (await client.query('INSERT INTO horses (name, normalized_name) VALUES ($1,$2) RETURNING id', [horse, hn])).rows[0];
      if (!rRow) rRow = (await client.query('INSERT INTO riders (name, normalized_name) VALUES ($1,$2) RETURNING id', [rider, rn])).rows[0];
      const seriesKey = g(ci.series) || null;
      let cRow = (await client.query('SELECT id, series_key FROM classes WHERE event_id = $1 AND name = $2 AND COALESCE(class_date::TEXT,\'\') = COALESCE($3,\'\')', [evId, cls, cdate])).rows[0];
      const newClass = !cRow;
      if (!cRow) {
        cRow = (await client.query(
          'INSERT INTO classes (event_id, name, class_date, height_cm, class_type, series_key, source) VALUES ($1,$2,$3,$4,$5,$6,\'MANUAL\') RETURNING id',
          [evId, cls, cdate || null, hcm, ctype, seriesKey])).rows[0];
      } else if (seriesKey && !cRow.series_key) {
        await client.query('UPDATE classes SET series_key = $2 WHERE id = $1', [cRow.id, seriesKey]);
        cRow.series_key = seriesKey;
      }
      const dup = await client.query(
        'SELECT id FROM round_results WHERE class_id = $1 AND horse_id = $2 AND rider_id = $3',
        [cRow.id, hRow.id, rRow.id]);
      if (dup.rows.length) { out.push({ line: li + 1, ok: false, errors: ['duplicate of an existing round'] }); continue; }
      const tot = (faults ?? 0) + (tf ?? 0);
      const ins = await client.query(
        `INSERT INTO round_results (event_id, class_id, horse_id, rider_id, jump_faults, time_faults,
          total_faults, time_seconds, finish_place, clear_round, height_cm, status, notes, source, points)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'MANUAL',0) RETURNING id, points`,
        [evId, cRow.id, hRow.id, rRow.id, faults ?? 0, tf ?? 0, tot, tsec, place,
         status === 'finished' && tot === 0, hcm, status, g(ci.notes) || null]);
      okCount++;
      out.push({ line: li + 1, ok: true, errors: [], preview: {
        rider, horse, class: cls, place, points: ins.rows[0].points,
        new_horse: newHorse, new_rider: newRider, new_class: newClass,
      }});
    }
    const summary = { total: grid.length - 1, ok: okCount, failed: out.filter((x) => !x.ok).length };
    if (dry_run) {
      await client.query('ROLLBACK');
      return res.json({ data: { dry_run: true, rows: out, summary } });
    }
    await client.query(
      'INSERT INTO import_logs (actor, source, filename, event_id, rows_total, rows_ok, rows_failed) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [(req.authUser && req.authUser.name) || 'admin', src, filename || null, evId, summary.total, summary.ok, summary.failed]);
    await client.query('COMMIT');
    audit(req, 'import.commit', 'event', evId, { ...summary, filename });
    res.status(201).json({ data: { dry_run: false, rows: out, summary } });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    throw e;
  } finally {
    client.release();
  }
}));

app.post('/auth/password', asyncH(async (req, res) => {
  if (!req.authUser) return res.status(401).json({ error: 'login required' });
  const { current, next } = req.body || {};
  if (!next || String(next).length < 8 || String(next).length > 72) {
    return res.status(400).json({ error: 'new password must be 8-72 chars' });
  }
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.authUser.id]);
  const u = rows[0];
  if (!u || !u.password_hash || !(await bcrypt.compare(String(current || ''), u.password_hash))) {
    return res.status(401).json({ error: 'current password incorrect' });
  }
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2',
    [await bcrypt.hash(String(next), 12), req.authUser.id]);
  await pool.query('DELETE FROM sessions WHERE user_id = $1', [req.authUser.id]);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  audit(req, 'auth.password_change', 'user', req.authUser.id, {});
  res.json({ ok: true, relogin: true });
}));

app.get('/admin/overview', needRole('ADMIN'), asyncH(async (req, res) => {
  const q = async (sql, args = []) => (await pool.query(sql, args)).rows[0];
  const horses = await q('SELECT COUNT(*)::INT AS n FROM horses');
  const riders = await q('SELECT COUNT(*)::INT AS n FROM riders');
  const events = await q('SELECT COUNT(*)::INT AS n FROM events');
  const rounds = await q('SELECT COUNT(*)::INT AS n FROM round_results');
  const pendingReview = await q("SELECT COUNT(*)::INT AS n FROM review_queue WHERE status='pending'");
  const pendingClaims = await q("SELECT COUNT(*)::INT AS n FROM rider_claims WHERE status='pending'");
  const users = await q('SELECT COUNT(*)::INT AS n FROM users');
  const lastImport = await q('SELECT created_at, rows_ok, rows_failed FROM import_logs ORDER BY created_at DESC LIMIT 1');
  const recent = (await pool.query(
    'SELECT action, actor, entity_type, created_at FROM entity_audit ORDER BY created_at DESC LIMIT 8')).rows;
  res.json({ data: {
    counts: { horses: horses.n, riders: riders.n, events: events.n, rounds: rounds.n,
              pendingReview: pendingReview.n, pendingClaims: pendingClaims.n, users: users.n },
    lastImport: lastImport || null, recent,
  }});
}));

app.get('/admin/lookup', needRole('ADMIN'), asyncH(async (req, res) => {
  const t = req.query.type, q = `%${String(req.query.q || '').trim()}%`;
  if (!['horse', 'rider', 'event', 'class'].includes(t) || String(req.query.q || '').trim().length < 2) {
    return res.json({ data: [] });
  }
  const map = {
    horse: 'SELECT id, name FROM horses WHERE name ILIKE $1 ORDER BY name LIMIT 8',
    rider: 'SELECT id, name FROM riders WHERE name ILIKE $1 ORDER BY name LIMIT 8',
    event: 'SELECT id, name FROM events WHERE name ILIKE $1 ORDER BY date_start DESC LIMIT 8',
    class: 'SELECT c.id, c.name, c.class_date FROM classes c WHERE c.name ILIKE $1 ORDER BY c.class_date DESC NULLS LAST LIMIT 8',
  };
  const { rows } = await pool.query(map[t], [q]);
  res.json({ data: rows });
}));

app.get('/admin/event-classes', needRole('ADMIN'), asyncH(async (req, res) => {
  if (!req.query.event_id) return res.status(400).json({ error: 'need ?event_id=' });
  const { rows } = await pool.query(
    'SELECT id, name, class_date, height_cm, class_type FROM classes WHERE event_id = $1 ORDER BY class_date, name',
    [req.query.event_id]);
  res.json({ data: rows });
}));

app.post('/admin/results', needRole('ADMIN'), asyncH(async (req, res) => {
  const { class_id, event_id, new_class, horse_id, horse_name, rider_id, rider_name,
    placing, jump_faults, time_faults, time_seconds, status, notes } = req.body || {};
  const errs = [];
  const place = placing === null || placing === undefined || placing === '' ? null : parseInt(placing, 10);
  if (place !== null && !(place >= 1)) errs.push('placing must be a positive integer');
  const num = (v, n) => {
    if (v === null || v === undefined || v === '') return null;
    const x = Number(v);
    if (!Number.isFinite(x)) errs.push(`${n} must be numeric`);
    return x;
  };
  const jf = num(jump_faults, 'jump_faults'), tf = num(time_faults, 'time_faults'),
    ts = num(time_seconds, 'time_seconds');
  const st = ['finished', 'eliminated', 'withdrawn', 'retired', 'disqualified'].includes(status) ? status : 'finished';
  if (!class_id && !(event_id && new_class)) errs.push('need class_id or event_id + new_class');
  if (!horse_id && !horse_name) errs.push('need horse_id or horse_name');
  if (!rider_id && !rider_name) errs.push('need rider_id or rider_name');
  if (errs.length) return res.status(400).json({ error: errs.join('; ') });

  const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const idOf = async (table, id, name, label) => {
    if (id) {
      const ex = await pool.query(`SELECT id FROM ${table} WHERE id = $1`, [id]);
      if (!ex.rows.length) throw Object.assign(new Error(`${label} not found`), { status: 404 });
      return id;
    }
    const nn = norm(name);
    const ex = await pool.query(`SELECT id FROM ${table} WHERE normalized_name = $1`, [nn]);
    if (ex.rows.length) return ex.rows[0].id;
    const col = table === 'horses' ? 'name, normalized_name' : 'name, normalized_name';
    return (await pool.query(`INSERT INTO ${table} (${col}) VALUES ($1,$2) RETURNING id`, [String(name).trim(), nn])).rows[0].id;
  };
  try {
    let cid = class_id || null;
    if (!cid) {
      const ev = await pool.query('SELECT id FROM events WHERE id = $1', [event_id]);
      if (!ev.rows.length) return res.status(404).json({ error: 'event not found' });
      cid = (await pool.query(
        'INSERT INTO classes (event_id, name, class_date, source) VALUES ($1,$2,$3,\'MANUAL\') RETURNING id',
        [event_id, String(new_class).trim(), null])).rows[0].id;
    }
    const hid = await idOf('horses', horse_id, horse_name, 'horse');
    const rid = await idOf('riders', rider_id, rider_name, 'rider');
    const dup = await pool.query(
      'SELECT id FROM round_results WHERE class_id = $1 AND horse_id = $2 AND rider_id = $3', [cid, hid, rid]);
    if (dup.rows.length) return res.status(409).json({ error: 'duplicate of an existing round' });
    const tot = (jf ?? 0) + (tf ?? 0);
    const ev = (await pool.query('SELECT event_id FROM classes WHERE id = $1', [cid])).rows[0];
    const { rows } = await pool.query(
      `INSERT INTO round_results (event_id, class_id, horse_id, rider_id, jump_faults, time_faults,
        total_faults, time_seconds, finish_place, clear_round, status, notes, source, points)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'MANUAL',0) RETURNING id, points`,
      [ev.event_id, cid, hid, rid, jf ?? 0, tf ?? 0, tot, ts, place,
       st === 'finished' && tot === 0, st, notes || null]);
    audit(req, 'result.create', 'result', rows[0].id, { class_id: cid, place });
    res.status(201).json({ data: rows[0] });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.status ? e.message : 'internal error' });
  }
}));

app.get('/admin/imports', needRole('ADMIN'), asyncH(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT l.*, e.name AS event_name FROM import_logs l
     LEFT JOIN events e ON e.id = l.event_id ORDER BY l.created_at DESC LIMIT 50`);
  res.json({ data: rows });
}));


// ---- Admin manage: search lists (including zero-start records) ----
app.get('/admin/horses', needRole('ADMIN'), asyncH(async (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`;
  const { rows } = await pool.query(
    `SELECT h.*, (SELECT COUNT(*)::INT FROM round_results rr WHERE rr.horse_id = h.id) AS starts
     FROM horses h ${req.query.q ? 'WHERE h.name ILIKE $1' : ''}
     ORDER BY h.name LIMIT ${req.query.q ? '50' : '200'}`,
    req.query.q ? [q] : []);
  res.json({ data: rows });
}));

app.get('/admin/riders', needRole('ADMIN'), asyncH(async (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`;
  const { rows } = await pool.query(
    `SELECT r.*, (SELECT COUNT(*)::INT FROM round_results rr WHERE rr.rider_id = r.id) AS starts
     FROM riders r ${req.query.q ? 'WHERE r.name ILIKE $1' : ''}
     ORDER BY r.name LIMIT ${req.query.q ? '50' : '200'}`,
    req.query.q ? [q] : []);
  res.json({ data: rows });
}));

app.get('/admin/events', needRole('ADMIN'), asyncH(async (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`;
  const { rows } = await pool.query(
    `SELECT e.*, (SELECT COUNT(*)::INT FROM classes c WHERE c.event_id = e.id) AS class_count,
       (SELECT COUNT(*)::INT FROM round_results rr WHERE rr.event_id = e.id) AS round_count
     FROM events e ${req.query.q ? 'WHERE e.name ILIKE $1' : ''}
     ORDER BY e.date_start DESC LIMIT ${req.query.q ? '50' : '200'}`,
    req.query.q ? [q] : []);
  res.json({ data: rows });
}));

const normFn = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const HORSE_FIELDS = ['name', 'breed', 'gender', 'sire', 'dam', 'damsire', 'breeder', 'year_of_birth', 'color', 'height', 'country', 'image_url'];
const RIDER_FIELDS = ['name', 'region', 'series_category', 'nationality', 'bio', 'image_url', 'first_name', 'last_name'];
const EVENT_FIELDS = ['name', 'venue', 'region', 'date_start', 'date_end', 'arena_type', 'event_type', 'status', 'description', 'image_url'];

function patcher(table, fields, label) {
  return asyncH(async (req, res) => {
    const body = req.body || {};
    const sets = [], vals = [];
    for (const f of fields) {
      if (body[f] !== undefined) {
        let v = body[f] === '' ? null : body[f];
        if (f === 'year_of_birth' && v !== null) {
          v = parseInt(v, 10);
          if (!(v >= 1980 && v <= 2100)) return res.status(400).json({ error: 'year_of_birth out of range' });
        }
        if ((f === 'date_start' || f === 'date_end') && v !== null && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
          return res.status(400).json({ error: `${f} must be YYYY-MM-DD` });
        }
        vals.push(v); sets.push(`${f} = $${vals.length}`);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'nothing to update' });
    if (body.name !== undefined) { vals.push(normFn(body.name)); sets.push(`normalized_name = $${vals.length}`); }
    vals.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
    if (!rows.length) return res.status(404).json({ error: `${label} not found` });
    audit(req, `${label}.edit`, table, req.params.id, { fields: Object.keys(body) });
    res.json({ data: rows[0] });
  });
}

app.patch('/admin/horses/:id', needRole('ADMIN'), patcher('horses', HORSE_FIELDS, 'horse'));
app.patch('/admin/riders/:id', needRole('ADMIN'), patcher('riders', RIDER_FIELDS, 'rider'));
app.patch('/admin/events/:id', needRole('ADMIN'), patcher('events', EVENT_FIELDS, 'event'));

app.delete('/admin/horses/:id', needRole('ADMIN'), asyncH(async (req, res) => {
  const n = (await pool.query('SELECT COUNT(*)::INT AS n FROM round_results WHERE horse_id = $1', [req.params.id])).rows[0].n;
  if (n > 0) return res.status(409).json({ error: `horse has ${n} rounds — delete results first` });
  const { rowCount } = await pool.query('DELETE FROM horses WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'horse not found' });
  audit(req, 'horse.delete', 'horses', req.params.id, {});
  res.json({ ok: true });
}));

app.delete('/admin/riders/:id', needRole('ADMIN'), asyncH(async (req, res) => {
  const n = (await pool.query('SELECT COUNT(*)::INT AS n FROM round_results WHERE rider_id = $1', [req.params.id])).rows[0].n;
  if (n > 0) return res.status(409).json({ error: `rider has ${n} rounds — delete results first` });
  const { rowCount } = await pool.query('DELETE FROM riders WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'rider not found' });
  audit(req, 'rider.delete', 'riders', req.params.id, {});
  res.json({ ok: true });
}));

app.delete('/admin/events/:id', needRole('ADMIN'), asyncH(async (req, res) => {
  const c = await pool.query(
    'SELECT (SELECT COUNT(*)::INT FROM classes WHERE event_id = $1) AS classes, (SELECT COUNT(*)::INT FROM round_results WHERE event_id = $1) AS rounds',
    [req.params.id]);
  const { rowCount } = await pool.query('DELETE FROM events WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'event not found' });
  audit(req, 'event.delete', 'events', req.params.id, { cascade: c.rows[0] });
  res.json({ ok: true, cascade: c.rows[0] });
}));


// ---- Corrections inbox (public form + admin curation) ----
app.post('/corrections', asyncH(async (req, res) => {
  const { name, email, subject, entity_type, entity_id, message } = req.body || {};
  const errs = [];
  if (!name || !String(name).trim()) errs.push('name required');
  if (!EMAIL_RE.test(String(email || '').trim().toLowerCase())) errs.push('valid email required');
  if (!message || !String(message).trim()) errs.push('message required');
  if (entity_type && !['horse', 'rider', 'event', 'class', 'result', 'other'].includes(entity_type)) {
    errs.push('bad entity_type');
  }
  if (errs.length) return res.status(400).json({ error: errs.join('; ') });
  const { rows } = await pool.query(
    `INSERT INTO correction_reports (name, email, subject, entity_type, entity_id, message)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, created_at`,
    [String(name).trim().slice(0, 100), String(email).trim().toLowerCase().slice(0, 200),
     String(subject || 'Correction').slice(0, 150), entity_type || null, entity_id || null,
     String(message).trim().slice(0, 5000)]);
  res.status(201).json({ data: rows[0] });
}));

app.get('/admin/corrections', needRole('ADMIN'), asyncH(async (req, res) => {
  const status = req.query.status || 'open';
  if (!['open', 'in_review', 'resolved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'bad status' });
  }
  const { rows } = await pool.query(
    'SELECT * FROM correction_reports WHERE status = $1 ORDER BY created_at DESC LIMIT 100', [status]);
  res.json({ data: rows });
}));

app.post('/admin/corrections/:id', needRole('ADMIN'), asyncH(async (req, res) => {
  const { status, resolved_note } = req.body || {};
  if (!['in_review', 'resolved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'status must be in_review|resolved|rejected' });
  }
  const { rows } = await pool.query(
    'UPDATE correction_reports SET status = $2, resolved_note = $3 WHERE id = $1 RETURNING *',
    [req.params.id, status, resolved_note || null]);
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  audit(req, 'correction.resolve', 'correction', req.params.id, { status });
  res.json({ data: rows[0] });
}));

// ---- Users management ----
app.get('/admin/users', needRole('ADMIN'), asyncH(async (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`;
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.email_verified_at, u.created_at,
       (SELECT COUNT(*)::INT FROM sessions s WHERE s.user_id = u.id AND s.expires_at > NOW()) AS active_sessions
     FROM users u ${req.query.q ? 'WHERE u.name ILIKE $1 OR u.email ILIKE $1' : ''}
     ORDER BY u.created_at DESC LIMIT 100`,
    req.query.q ? [q] : []);
  res.json({ data: rows });
}));

app.patch('/admin/users/:id', needRole('ADMIN'), asyncH(async (req, res) => {
  const { role } = req.body || {};
  if (!['PUBLIC', 'RIDER', 'COACH', 'OWNER', 'BREEDER', 'ADMIN'].includes(role)) {
    return res.status(400).json({ error: 'bad role' });
  }
  if (req.params.id === req.authUser.id && role !== 'ADMIN') {
    return res.status(400).json({ error: 'cannot demote yourself' });
  }
  const { rows } = await pool.query('UPDATE users SET role = $2 WHERE id = $1 RETURNING id, name, email, role', [req.params.id, role]);
  if (!rows.length) return res.status(404).json({ error: 'user not found' });
  audit(req, 'user.role', 'user', req.params.id, { role });
  res.json({ data: rows[0] });
}));

app.delete('/admin/users/:id/sessions', needRole('ADMIN'), asyncH(async (req, res) => {
  if (req.params.id === req.authUser.id) {
    return res.status(400).json({ error: 'cannot revoke your own sessions here — use logout' });
  }
  const { rowCount } = await pool.query('DELETE FROM sessions WHERE user_id = $1', [req.params.id]);
  audit(req, 'user.revoke_sessions', 'user', req.params.id, { count: rowCount });
  res.json({ ok: true, revoked: rowCount });
}));

// ---- Series management ----
app.get('/admin/series', needRole('ADMIN'), asyncH(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.series_key, MIN(s.series_name) AS series_name, MIN(s.event_name) AS event_name,
       MIN(s.season) AS season, COUNT(*)::INT AS entries,
       MIN(i.display_name) AS display_name, MIN(i.qual_rules) AS qual_rules,
       MAX(i.best_of) AS best_of, BOOL_OR(COALESCE(i.auto_calc, FALSE)) AS auto_calc,
       BOOL_OR(COALESCE(i.is_official, FALSE)) AS is_official,
       MIN(i.official_source) AS official_source, MIN(i.description) AS description
     FROM series_standings s LEFT JOIN series_info i ON i.series_key = s.series_key
     GROUP BY s.series_key ORDER BY series_key`);
  res.json({ data: rows });
}));

app.patch('/admin/series/:key', needRole('ADMIN'), asyncH(async (req, res) => {
  const { display_name, description, qual_rules, is_official, official_source, best_of, auto_calc } = req.body || {};
  const bo = best_of === '' || best_of === null || best_of === undefined ? null : parseInt(best_of, 10);
  if (bo !== null && !(bo > 0)) return res.status(400).json({ error: 'best_of must be positive' });
  const { rows } = await pool.query(
    `INSERT INTO series_info (series_key, display_name, description, qual_rules, is_official, official_source, best_of, auto_calc, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
     ON CONFLICT (series_key) DO UPDATE SET display_name = EXCLUDED.display_name,
       description = EXCLUDED.description, qual_rules = EXCLUDED.qual_rules,
       is_official = EXCLUDED.is_official, official_source = EXCLUDED.official_source,
       best_of = EXCLUDED.best_of, auto_calc = EXCLUDED.auto_calc,
       updated_at = NOW() RETURNING *`,
    [req.params.key, display_name || null, description || null, qual_rules || null,
     !!is_official, official_source || null, bo, !!auto_calc]);
  audit(req, 'series.edit', 'series', req.params.key, { is_official: !!is_official });
  res.json({ data: rows[0] });
}));

app.delete('/admin/series/:key', needRole('ADMIN'), asyncH(async (req, res) => {
  const st = await pool.query('DELETE FROM series_standings WHERE series_key = $1', [req.params.key]);
  await pool.query('DELETE FROM series_info WHERE series_key = $1', [req.params.key]);
  audit(req, 'series.delete', 'series', req.params.key, { rows: st.rowCount });
  res.json({ ok: true, deleted: st.rowCount });
}));

// ---- Export (full backup JSON) ----
app.get('/admin/export', needRole('ADMIN'), asyncH(async (req, res) => {
  const dump = async (t) => (await pool.query(`SELECT * FROM ${t}`)).rows;
  const data = {};
  for (const t of ['users', 'horses', 'riders', 'events', 'classes', 'round_results', 'raw_results',
      'horse_aliases', 'rider_aliases', 'breeder_aliases', 'training_records', 'health_records',
      'review_queue', 'series_standings', 'series_info', 'watchlist_items', 'saved_comparisons',
      'alert_prefs', 'sessions', 'rider_claims', 'coach_athletes', 'correction_reports',
      'import_logs', 'entity_audit', 'admin_settings', 'weather_cache']) {
    try { data[t] = await dump(t); } catch { data[t] = { error: 'unavailable' }; }
  }
  // never export password hashes
  if (Array.isArray(data.users)) data.users = data.users.map((u) => ({ ...u, password_hash: undefined }));
  audit(req, 'admin.export', 'system', null, {});
  res.setHeader('Content-Disposition', `attachment; filename="eqindex-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({ exported_at: new Date().toISOString(), data });
}));

// ---- Danger: wipe competition data (typed confirmation) ----
app.post('/admin/wipe', needRole('ADMIN'), asyncH(async (req, res) => {
  if (req.body?.confirm !== 'WIPE COMPETITION DATA') {
    return res.status(400).json({ error: 'send {confirm: "WIPE COMPETITION DATA"}' });
  }
  const counts = {};
  for (const t of ['round_results', 'raw_results', 'series_standings', 'classes', 'events', 'weather_cache']) {
    counts[t] = (await pool.query(`SELECT COUNT(*)::INT AS n FROM ${t}`)).rows[0].n;
    await pool.query(`TRUNCATE ${t} CASCADE`);
  }
  audit(req, 'admin.wipe', 'system', null, counts);
  res.json({ ok: true, deleted: counts });
}));

// ---- Surface splits (arena × surface per horse/rider) ----
app.get('/horses/:id/splits', asyncH(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT arena_type, surface, starts, clears, clear_pct, avg_faults FROM horse_surface_stats WHERE horse_id = $1 ORDER BY starts DESC',
    [req.params.id]);
  res.json({ data: rows });
}));

app.get('/riders/:id/splits', asyncH(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT arena_type, surface, starts, clears, clear_pct, avg_faults FROM rider_surface_stats WHERE rider_id = $1 ORDER BY starts DESC',
    [req.params.id]);
  res.json({ data: rows });
}));

// ---- Venues ----
app.get('/venues', asyncH(async (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`;
  const { rows } = await pool.query(
    `SELECT v.*, (SELECT COUNT(*)::INT FROM events e WHERE e.venue_id = v.id) AS events,
       (SELECT COUNT(*)::INT FROM round_results rr JOIN events e ON e.id = rr.event_id WHERE e.venue_id = v.id) AS rounds
     FROM venues v ${req.query.q ? 'WHERE v.name ILIKE $1' : ''} ORDER BY v.name LIMIT 100`,
    req.query.q ? [q] : []);
  res.json({ data: rows });
}));

// ---- Series engine (spec v2 S5): matrix, completed/remaining, drops, recalc ----
app.get('/series/:key/detail', asyncH(async (req, res) => {
  const key = req.params.key;
  const info = (await pool.query('SELECT * FROM series_info WHERE series_key = $1', [key])).rows[0] || null;
  let standings, events, source;
  if (info && info.auto_calc) {
    const { rows } = await pool.query(
      `SELECT r.name AS rider, h.name AS horse, e.name AS event, e.id AS event_id,
         MIN(c.class_date) AS event_date, SUM(rr.points)::INT AS pts, COUNT(*)::INT AS rounds
       FROM round_results rr
       JOIN classes c ON c.id = rr.class_id
       JOIN events e ON e.id = rr.event_id
       JOIN riders r ON r.id = rr.rider_id
       JOIN horses h ON h.id = rr.horse_id
       WHERE c.series_key = $1
       GROUP BY r.name, h.name, e.name, e.id`, [key]);
    const byCombo = {};
    for (const row of rows) {
      const k = `${row.rider}||${row.horse}`;
      (byCombo[k] ||= { rider: row.rider, horse: row.horse, events: {}, rounds: 0 });
      byCombo[k].events[row.event] = (byCombo[k].events[row.event] || 0) + row.pts;
      byCombo[k].rounds += row.rounds;
    }
    const n = info.best_of || null;
    standings = Object.values(byCombo).map((c) => {
      const scores = Object.values(c.events).sort((a, b) => b - a);
      const counted = n ? scores.slice(0, n) : scores;
      return { ...c, total: counted.reduce((s, v) => s + v, 0),
        dropped: scores.length - counted.length,
        dropped_pts: scores.slice(counted.length).reduce((s, v) => s + v, 0) };
    }).sort((a, b) => b.total - a.total)
      .map((c, i) => ({ ...c, rank: i + 1 }));
    const evMap = {};
    for (const row of rows) {
      (evMap[row.event] ||= { event: row.event, event_id: row.event_id, date: row.event_date, combos: 0 });
      evMap[row.event].combos += 1;
    }
    const today = new Date().toISOString().slice(0, 10);
    events = Object.values(evMap)
      .map((e) => ({ ...e, completed: (e.date || '') < today }))
      .sort((a, b) => (a.date || '') < (b.date || '') ? -1 : 1);
    source = 'independent';
  } else {
    const { rows } = await pool.query(
      `SELECT rider_name, horse_name, total_points, points,
         (SELECT COUNT(*) FROM jsonb_each_text(points) WHERE NULLIF(value, '') IS NOT NULL)::INT AS shows,
         RANK() OVER (ORDER BY total_points DESC)::INT AS rank
       FROM series_standings WHERE series_key = $1 ORDER BY total_points DESC`, [key]);
    standings = rows.map((r) => ({
      rider: r.rider_name, horse: r.horse_name, events: r.points || {},
      total: Number(r.total_points), rank: Number(r.rank), shows: Number(r.shows),
    }));
    const labels = [...new Set(standings.flatMap((c) => Object.keys(c.events || {})))];
    events = labels.map((event) => ({ event, event_id: null, date: null, combos: null, completed: null }));
    source = info && info.is_official ? 'official' : 'independent';
  }
  const lastCalc = info?.calculated_at
    || (await pool.query('SELECT MAX(imported_at) AS m FROM series_standings WHERE series_key = $1', [key])).rows[0]?.m
    || null;
  res.json({ data: { key, info, standings, events, source, last_calculated: lastCalc } });
}));

app.post('/admin/series/:key/recalc', needRole('ADMIN'), asyncH(async (req, res) => {
  const { rows } = await pool.query(
    `INSERT INTO series_info (series_key, calculated_at) VALUES ($1, NOW())
     ON CONFLICT (series_key) DO UPDATE SET calculated_at = NOW() RETURNING *`, [req.params.key]);
  audit(req, 'series.recalc', 'series', req.params.key, {});
  res.json({ data: rows[0] });
}));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[api]', err.message);
  res.status(500).json({ error: 'internal error' });
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`[api] listening on :${port}`));
