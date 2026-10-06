const pool = require('../db');
const privacy = require('../privacy');
const { asyncH } = require('../lib/async');
const { paging, numOrNull } = require('../lib/http');
const { roundFiltersVis, visSql } = require('../lib/filters');
const { EMAIL_RE, throttled, ownOrAdmin } = require('../lib/auth');
const { audit } = require('../lib/audit');
const { resolveId } = require('../lib/resolve');
const { canonCategoryKey, masterCategoryKeys } = require('../lib/categories');
const { seriesCountFor } = require('./scoring');

// Active ESNZ series config (mode='esnz' version), cached 60s.
let esnzCache = { t: 0, cfg: null };
async function loadEsnzSeries() {
  if (Date.now() - esnzCache.t < 60 * 1000 && esnzCache.cfg !== undefined) return esnzCache.cfg;
  let cfg = null;
  try {
    const { rows } = await pool.query(
      `SELECT params->'esnz'->'series' AS series FROM scoring_versions
       WHERE status = 'active' AND (params->>'mode') = 'esnz' ORDER BY season DESC LIMIT 1`);
    cfg = rows[0]?.series || null;
  } catch { /* no esnz version */ }
  esnzCache = { t: Date.now(), cfg };
  return cfg;
}

// Weekend categories: dedicated table first (own admin menu), scoring
// version params as fallback, v0.3 defaults last. Cached 60s.
let catsCache = { t: 0, cats: null };
async function loadWeekendCats() {
  const now = Date.now();
  if (now - catsCache.t < 60 * 1000 && catsCache.cats) return catsCache.cats;
  let cats = null;
  try {
    const { rows } = await pool.query(
      `SELECT key, title, label, name_contains, class_types, exclude_name
       FROM rider_categories WHERE is_active ORDER BY sort, key`);
    if (rows.length) {
      cats = rows.map((r) => ({
        key: r.key, title: r.title, label: r.label,
        nameContains: r.name_contains || [], classTypes: r.class_types || [],
        excludeName: r.exclude_name || [],
      }));
    }
  } catch { /* pre-migration: fall through */ }
  if (!cats) {
    const { activeRules } = require('./scoring');
    const rules = await activeRules().catch(() => null);
    cats = (rules && rules.categories) || [
      { key: 'pro', title: 'Best Pro Rider', label: 'Pro Rider', nameContains: [], classTypes: ['Grand Prix', 'Premier', 'Open'], excludeName: ['pony', 'junior', 'young rider', 'amateur', 'pro am'] },
      { key: 'young', title: 'Best Young Rider', label: 'Young Rider', nameContains: ['young rider'], classTypes: [], excludeName: [] },
      { key: 'junior', title: 'Best Junior Rider', label: 'Junior Rider', nameContains: ['junior'], classTypes: [], excludeName: [] },
      { key: 'amateur', title: 'Best Amateur', label: 'Amateur', nameContains: ['amateur', 'pro am'], classTypes: ['Amateur'], excludeName: [] },
      { key: 'pony', title: 'Best Pony Rider', label: 'Pony Rider', nameContains: ['pony'], classTypes: [], excludeName: [] },
    ];
  }
  catsCache = { t: now, cats };
  return cats;
}

module.exports = function mountPublicRoutes(app) {
  app.get('/health', asyncH(async (req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  }));

  // ---- Rankings (PRD §7.5) ----
  app.get('/rankings/horses', asyncH(async (req, res) => {
    const { limit, minStarts } = paging(req);
    // EQIndex Rating mode (Briefing §13): ?metric=eqindex — 0–2000 centred 1000.
    // Min 5 rounds per methodology; adapted to 3 while circuit data is thin
    // (max 4 starts/horse in current data — revisit to 5 as volume grows).
    // metric=ei accepted as legacy alias.
    if (req.query.metric === 'eqindex' || req.query.metric === 'ei') {
      const minS = req.query.min_starts ? minStarts : 3;
      // Height band re-rates within the band (031); career proven/DI stay global.
      const hMin = numOrNull(req.query.height_min), hMax = numOrNull(req.query.height_max);
      if (hMin !== null || hMax !== null) {
        const { rows } = await pool.query(
          `SELECT * FROM horse_eqindex_band($1,$2) WHERE starts >= $3
           ORDER BY rating DESC, wins DESC, starts DESC LIMIT $4`,
          [hMin, hMax, minS, limit]
        );
        return res.json({ data: rows, metric: 'eqindex', band: { height_min: hMin, height_max: hMax } });
      }
      const { rows } = await pool.query(
        `SELECT e.horse_id, e.horse, e.horse_slug, e.starts, e.eff_starts,
           e.raw_avg, e.shrunk_avg, e.rating, e.provisional, e.age_adj,
           e.clears, e.clear_pct, e.avg_faults, e.faults_stddev,
           e.wins, e.best_place, e.last_start
         FROM horse_eqindex_rating e
         WHERE e.starts >= $1
         ORDER BY e.rating DESC, e.wins DESC, e.starts DESC LIMIT $2`,
        [minS, limit]
      );
      return res.json({ data: rows, metric: 'eqindex' });
    }
    // Briefing §5 points mode: ?metric=points&window=all|12m|3m (views, pre-aggregated).
    if (req.query.metric === 'points') {
      const col = req.query.window === '12m' ? 'points_12m' : req.query.window === '3m' ? 'points_3m' : 'total_points';
      const { rows } = await pool.query(
        `SELECT p.horse_id, p.horse, p.horse_slug, p.total_starts AS starts, s.clears, s.clear_pct,
           s.avg_faults, s.faults_stddev, p.wins, p.podiums, p.win_rate,
           p.total_points, p.points_12m, p.points_3m, p.last_start, h.year_of_birth
         FROM horse_point_stats p LEFT JOIN horse_stats s ON s.horse_id = p.horse_id
         LEFT JOIN horses h ON h.id = p.horse_id
         WHERE p.total_starts >= $1
         ORDER BY p.${col} DESC, p.wins DESC, p.total_starts DESC LIMIT $2`,
        [minStarts, limit]
      );
      return res.json({ data: rows, metric: 'points', window: req.query.window || 'all' });
    }
    const f = await roundFiltersVis(req.query);
    const { rows } = await pool.query(
      `SELECT h.id AS horse_id, h.name AS horse, h.slug AS horse_slug, h.year_of_birth, COUNT(*) AS starts,
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
       GROUP BY h.id, h.name, h.slug HAVING COUNT(*) >= ${minStarts}
       ORDER BY clear_pct DESC, avg_faults ASC, starts DESC LIMIT $${f.params.length + 1}`,
      [...f.params, limit]
    );
    res.json({ data: rows });
  }));

  app.get('/rankings/riders', asyncH(async (req, res) => {
    const { limit, minStarts } = paging(req);
    // Series filter accepts master keys; legacy labels resolve too (old URLs).
    const cat = canonCategoryKey(req.query.series, await masterCategoryKeys(pool)) || '';
    if (req.query.metric === 'eqindex' || req.query.metric === 'ei') {
      const minS = req.query.min_starts ? minStarts : 3;
      const hMin = numOrNull(req.query.height_min), hMax = numOrNull(req.query.height_max);
      if (hMin !== null || hMax !== null) {
        const conds = ['starts >= $3'], params = [hMin, hMax, minS];
        if (cat) { params.push(cat); conds.push(`series_category = $${params.length}`); }
        params.push(limit);
        const { rows } = await pool.query(
          `SELECT * FROM rider_eqindex_band($1,$2) WHERE ${conds.join(' AND ')}
           ORDER BY rating DESC, wins DESC, starts DESC LIMIT $${params.length}`,
          params
        );
        return res.json({ data: rows, metric: 'eqindex', band: { height_min: hMin, height_max: hMax } });
      }
      const catFilter = cat ? ` AND e.series_category = $3` : '';
      const { rows } = await pool.query(
        `SELECT e.rider_id, e.rider, e.rider_slug, e.series_category, e.starts,
           e.eff_starts, e.raw_avg, e.shrunk_avg, e.rating, e.provisional,
           e.clears, e.clear_pct, e.avg_faults, e.wins, e.horses_ridden, e.last_start
         FROM rider_eqindex_rating e
         WHERE e.starts >= $1${catFilter}
         ORDER BY e.rating DESC, e.wins DESC, e.starts DESC LIMIT $2`,
        cat ? [minS, limit, cat] : [minS, limit]
      );
      return res.json({ data: rows, metric: 'eqindex' });
    }
    if (req.query.metric === 'points') {
      const col = req.query.window === '12m' ? 'points_12m' : req.query.window === '3m' ? 'points_3m' : 'total_points';
      const catFilter = cat ? ` AND p.series_category = $3` : '';
      const { rows } = await pool.query(
        `SELECT p.rider_id, p.rider, p.rider_slug, p.series_category, p.total_starts AS starts, s.clears, s.clear_pct,
           s.avg_faults, s.wins, s.horses_ridden, p.podiums, p.win_rate,
           p.total_points, p.points_12m, p.points_3m, p.last_start
         FROM rider_point_stats p LEFT JOIN rider_stats s ON s.rider_id = p.rider_id
         WHERE p.total_starts >= $1${catFilter}
         ORDER BY p.${col} DESC, p.wins DESC, p.total_starts DESC LIMIT $2`,
        cat ? [minStarts, limit, cat] : [minStarts, limit]
      );
      return res.json({ data: rows, metric: 'points', window: req.query.window || 'all' });
    }
    const f = await roundFiltersVis(req.query);
    const catClause = cat ? ` AND r.series_category = $${f.params.length + 1}` : '';
    const catParams = cat ? [...f.params, cat] : f.params;
    const { rows } = await pool.query(
      `SELECT r.id AS rider_id, r.name AS rider, r.slug AS rider_slug, r.series_category, COUNT(*) AS starts,
         SUM(rr.clear_round::INT) AS clears,
         ROUND(100.0 * AVG(rr.clear_round::INT), 1) AS clear_pct,
         ROUND(AVG(rr.total_faults), 2) AS avg_faults,
         COUNT(*) FILTER (WHERE rr.finish_place = 1) AS wins,
         COUNT(DISTINCT rr.horse_id) AS horses_ridden, MAX(c.class_date) AS last_start
       FROM riders r
       JOIN round_results rr ON rr.rider_id = r.id
       JOIN classes c ON c.id = rr.class_id
       JOIN events e ON e.id = rr.event_id
       ${f.clause}${f.clause ? ' AND' : 'WHERE'} 1=1${catClause}
       GROUP BY r.id, r.name, r.slug, r.series_category HAVING COUNT(*) >= ${minStarts}
       ORDER BY clear_pct DESC, avg_faults ASC, starts DESC LIMIT $${catParams.length + 1}`,
      [...catParams, limit]
    );
    res.json({ data: rows });
  }));

  // ---- Breeders: directory + profile (breeder is a free-text column on
  // horses; spelling variants are canonicalised into breeder_aliases).
  // Stats count visible rounds only (class_id_visible, migration 032).
  app.get('/breeders', asyncH(async (req, res) => {
    const { limit } = paging(req, 100, 500);
    const conds = [`h.breeder IS NOT NULL AND h.breeder <> ''`], params = [];
    if (req.query.q && String(req.query.q).trim()) {
      params.push(`%${String(req.query.q).trim()}%`);
      conds.push(`h.breeder ILIKE $${params.length}`);
    }
    params.push(limit);
    const { rows } = await pool.query(
      `SELECT h.breeder AS breeder,
          COUNT(DISTINCT h.id)::INT AS horses,
          COUNT(rr.id)::INT AS starts,
          COALESCE(SUM(rr.clear_round::INT), 0)::INT AS clears,
          ROUND(100.0 * AVG(rr.clear_round::INT), 1) AS clear_pct,
          ROUND(AVG(rr.total_faults), 2) AS avg_faults,
          COUNT(*) FILTER (WHERE rr.finish_place = 1)::INT AS wins,
          COALESCE(SUM(rr.points), 0)::INT AS total_points
        FROM horses h
        LEFT JOIN round_results rr
          ON rr.horse_id = h.id AND class_id_visible(rr.class_id)
        WHERE ${conds.join(' AND ')}
        GROUP BY h.breeder
        ORDER BY horses DESC, starts DESC LIMIT $${params.length}`,
      params
    );
    res.json({ data: rows });
  }));

  app.get('/breeders/:name', asyncH(async (req, res) => {
    const name = decodeURIComponent(req.params.name);
    const agg = await pool.query(
      `SELECT h.breeder AS breeder,
          COUNT(DISTINCT h.id)::INT AS horses,
          COUNT(rr.id)::INT AS starts,
          COALESCE(SUM(rr.clear_round::INT), 0)::INT AS clears,
          ROUND(100.0 * AVG(rr.clear_round::INT), 1) AS clear_pct,
          ROUND(AVG(rr.total_faults), 2) AS avg_faults,
          COUNT(*) FILTER (WHERE rr.finish_place = 1)::INT AS wins,
          COALESCE(SUM(rr.points), 0)::INT AS total_points
        FROM horses h
        LEFT JOIN round_results rr
          ON rr.horse_id = h.id AND class_id_visible(rr.class_id)
        WHERE h.breeder = $1
        GROUP BY h.breeder`,
      [name]
    );
    if (!agg.rows.length) return res.status(404).json({ error: 'breeder not found' });
    const horses = await pool.query(
      `SELECT h.id AS horse_id, h.name AS horse, h.slug AS horse_slug,
          h.sire, h.dam, h.year_of_birth,
          COUNT(rr.id)::INT AS starts,
          COUNT(*) FILTER (WHERE rr.finish_place = 1)::INT AS wins,
          COALESCE(SUM(rr.points), 0)::INT AS total_points
        FROM horses h
        LEFT JOIN round_results rr
          ON rr.horse_id = h.id AND class_id_visible(rr.class_id)
        WHERE h.breeder = $1
        GROUP BY h.id, h.name, h.slug, h.sire, h.dam, h.year_of_birth
        ORDER BY total_points DESC, starts DESC`,
      [name]
    );
    const sires = await pool.query(
      `SELECT h.sire AS sire,
          COUNT(DISTINCT h.id)::INT AS horses,
          COUNT(rr.id)::INT AS starts,
          COUNT(*) FILTER (WHERE rr.finish_place = 1)::INT AS wins,
          COALESCE(SUM(rr.points), 0)::INT AS total_points,
          ROUND(100.0 * AVG(rr.clear_round::INT), 1) AS clear_pct
        FROM horses h
        LEFT JOIN round_results rr
          ON rr.horse_id = h.id AND class_id_visible(rr.class_id)
        WHERE h.breeder = $1 AND h.sire IS NOT NULL AND h.sire <> ''
        GROUP BY h.sire
        ORDER BY total_points DESC, starts DESC`,
      [name]
    );
    const heights = await pool.query(
      `SELECT COALESCE(rr.height_cm, c.height_cm)::INT AS height_cm,
          COUNT(*)::INT AS starts,
          SUM(rr.clear_round::INT)::INT AS clears,
          ROUND(100.0 * AVG(rr.clear_round::INT), 1) AS clear_pct,
          COUNT(*) FILTER (WHERE rr.finish_place = 1)::INT AS wins,
          COALESCE(SUM(rr.points), 0)::INT AS total_points
        FROM round_results rr
        JOIN horses h ON h.id = rr.horse_id
        JOIN classes c ON c.id = rr.class_id
        WHERE h.breeder = $1 AND class_id_visible(rr.class_id)
          AND COALESCE(rr.height_cm, c.height_cm) IS NOT NULL
        GROUP BY 1
        ORDER BY 1`,
      [name]
    );
    res.json({ data: agg.rows[0], horses: horses.rows, sires: sires.rows, heights: heights.rows });
  }));

  // ---- Events (PRD §7.3, §7.7) ----
  app.get('/events', asyncH(async (req, res) => {
    const { limit } = paging(req);
    const conds = [], params = [];
    const push = (sql, v) => { params.push(v); conds.push(sql.replace('?', `$${params.length}`)); };
    if (req.query.season) push('e.season = ?', req.query.season);
    if (req.query.region) push('e.region = ?', req.query.region);
    if (req.query.arena) push('e.arena_type = ?', req.query.arena);
    // Empty placeholder events (no classes/rounds, e.g. calendar shells)
    // are hidden by default so only events with real results show.
    // Pass ?include_empty=1 to list everything (admin data-entry).
    // ?has_data=1 is accepted as an explicit alias of the default.
    const wantUpcoming = req.query.upcoming === '1' || req.query.upcoming === 'true';
    const wantFinished = req.query.finished === '1' || req.query.finished === 'true';
    if (wantUpcoming) {
      // Fixtures not yet started. They have no results by definition,
      // so this implies include_empty.
      conds.push('e.date_start > CURRENT_DATE');
    } else {
      if (req.query.include_empty !== '1' && req.query.include_empty !== 'true') {
        conds.push('(EXISTS (SELECT 1 FROM classes c WHERE c.event_id = e.id) OR EXISTS (SELECT 1 FROM round_results rr WHERE rr.event_id = e.id))');
      }
      // ?finished=1 → only events that have ended (date_end, else date_start).
      if (wantFinished) conds.push('COALESCE(e.date_end, e.date_start) <= CURRENT_DATE');
    }
    // Inactive shows are hidden by default (backend on/off switch); admin
    // callers pass ?include_inactive=1.
    if (!req.query.include_inactive) conds.push('e.is_active IS NOT FALSE');
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    // Upcoming fixtures read soonest-first; everything else newest-first.
    const orderDir = wantUpcoming ? 'ASC' : 'DESC';
    const { rows } = await pool.query(
      `SELECT e.*,
         (SELECT COUNT(*)::INT FROM classes c WHERE c.event_id = e.id) AS class_count,
         (SELECT COUNT(*)::INT FROM round_results rr WHERE rr.event_id = e.id) AS round_count,
         (SELECT COUNT(*)::INT FROM (SELECT DISTINCT rr.horse_id, rr.rider_id FROM round_results rr WHERE rr.event_id = e.id) t) AS combo_count
       FROM events e ${where} ORDER BY e.date_start ${orderDir} LIMIT $${params.length + 1}`,
      [...params, limit]
    );
    res.json({ data: rows });
  }));

  // ---- Year-on-year: same venue+name family across seasons ----
  app.get('/events/compare', asyncH(async (req, res) => {
    const name = String(req.query.name || '').trim();
    if (!name) return res.status(400).json({ error: 'need ?name=' });
    const base = name.toLowerCase().replace(/20\d\d.*/g, '').trim();
    const { rows } = await pool.query(
      `SELECT e.*, (SELECT COUNT(*)::INT FROM classes c WHERE c.event_id = e.id) AS class_count,
         (SELECT COUNT(*)::INT FROM round_results rr WHERE rr.event_id = e.id) AS round_count,
         (SELECT ROUND(AVG(rr.total_faults), 2) FROM round_results rr WHERE rr.event_id = e.id) AS avg_faults
       FROM events e WHERE lower(regexp_replace(e.name, '20\\d\\d.*', '')) = $1
       ORDER BY e.date_start`, [base]);
    res.json({ data: rows });
  }));

  // ---- Age cohort: horses born within ±2 years, ranked by points ----
  app.get('/horses/:id/cohort', asyncH(async (req, res) => {
    const me = await pool.query('SELECT year_of_birth FROM horses WHERE id = $1', [req.params.id]);
    if (!me.rows.length) return res.status(404).json({ error: 'horse not found' });
    const yob = me.rows[0].year_of_birth;
    if (!yob) return res.json({ data: { yob: null, peers: [] } });
    const { rows } = await pool.query(
      `SELECT h.id AS horse_id, h.name AS horse, h.year_of_birth,
         COALESCE(p.total_points, 0) AS total_points,
         COALESCE(p.wins, 0) AS wins, COALESCE(p.total_starts, 0) AS starts
       FROM horses h LEFT JOIN horse_point_stats p ON p.horse_id = h.id
       WHERE h.year_of_birth BETWEEN $1 AND $2
       ORDER BY total_points DESC LIMIT 20`,
      [yob - 2, yob + 2]);
    res.json({ data: { yob, peers: rows } });
  }));

  app.get('/events/:id', asyncH(async (req, res) => {
    req.params.id = await resolveId('events', req.params.id, res);
    if (!req.params.id) return;
    const { rows } = await pool.query('SELECT * FROM events WHERE id = $1', [req.params.id]);
    if (!rows.length || rows[0].is_active === false) return res.status(404).json({ error: 'event not found' });
    const classes = await pool.query(
      'SELECT * FROM class_stats WHERE class_id IN (SELECT id FROM classes WHERE event_id = $1)',
      [req.params.id]
    );
    res.json({ data: rows[0], classes: classes.rows });
  }));

  // ---- Profiles ----
  app.get('/horses/:id', asyncH(async (req, res) => {
    req.params.id = await resolveId('horses', req.params.id, res);
    if (!req.params.id) return;
    const horse = await pool.query(
      `SELECT h.*, u.name AS owner_name FROM horses h
       LEFT JOIN users u ON u.id = h.owner_id WHERE h.id = $1`, [req.params.id]);
    if (!horse.rows.length) return res.status(404).json({ error: 'horse not found' });
    const stats = await pool.query('SELECT * FROM horse_stats WHERE horse_id = $1', [req.params.id]);
    const history = await pool.query(
      `SELECT rr.*, c.name AS class_name, e.name AS event_name, c.class_date, r.name AS rider, r.slug AS rider_slug
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
    // Privacy opt-out: mask the profile row itself (history/partnership rows
    // are masked by the generic response wrapper). Admins see real names.
    const sets = req.authUser?.role === 'ADMIN' ? null : await privacy.privacySets(pool);
    res.json({ data: privacy.maskHorseRow(horse.rows[0], sets), stats: stats.rows[0] || null, history: history.rows, partnerships: partners.rows });
  }));

  // ---- EQIndex rating breakdown (transparency: every component per round) ----
  const EQINDEX_BREAKDOWN_SQL = `
    SELECT c.class_date, e.name AS event_name, c.name AS class_name,
      rr.finish_place, rr.clear_round, rr.jump_faults, rr.time_faults,
      r.base, ROUND(r.base,2) AS base_pts,
      ROUND(r.height_mult,2) AS height_mult,
      ROUND(r.di_mult,3) AS di_mult,
      ROUND(r.field_mult,3) AS field_mult,
      ROUND(r.size_mod,2) AS size_mod,
      ROUND(hp.handicap,3) AS handicap,
      ROUND(r.recency_w,3) AS recency_w,
      ROUND(r.base * r.height_mult * r.di_mult * r.field_mult * r.size_mod
        * hp.handicap * r.recency_w, 2) AS weighted
    FROM eqindex_round r
    JOIN round_results rr ON rr.id = r.id
    JOIN classes c ON c.id = rr.class_id
    JOIN LATERAL (
      SELECT eqindex_handicap(
        (SELECT MAX(x.h) FROM eqindex_round x WHERE x.%IDCOL% = rr.%IDCOL%),
        r.h) AS handicap
    ) hp ON true
    JOIN events e ON e.id = rr.event_id
    WHERE rr.%IDCOL% = $1
    ORDER BY c.class_date DESC NULLS LAST, c.name LIMIT 50`;

  app.get('/horses/:id/rating', asyncH(async (req, res) => {
    req.params.id = await resolveId('horses', req.params.id, res);
    if (!req.params.id) return;
    const agg = await pool.query('SELECT * FROM horse_eqindex_rating WHERE horse_id = $1', [req.params.id]);
    if (!agg.rows.length) return res.status(404).json({ error: 'no rounds for this horse' });
    const sql = EQINDEX_BREAKDOWN_SQL.replace(/%IDCOL%/g, 'horse_id');
    const rounds = await pool.query(sql, [req.params.id]);
    res.json({ data: agg.rows[0], rounds: rounds.rows });
  }));

  app.get('/riders/:id/rating', asyncH(async (req, res) => {
    req.params.id = await resolveId('riders', req.params.id, res);
    if (!req.params.id) return;
    const agg = await pool.query('SELECT * FROM rider_eqindex_rating WHERE rider_id = $1', [req.params.id]);
    if (!agg.rows.length) return res.status(404).json({ error: 'no rounds for this rider' });
    const sql = EQINDEX_BREAKDOWN_SQL.replace(/%IDCOL%/g, 'rider_id');
    const rounds = await pool.query(sql, [req.params.id]);
    res.json({ data: agg.rows[0], rounds: rounds.rows });
  }));

  app.get('/riders/:id', asyncH(async (req, res) => {
    req.params.id = await resolveId('riders', req.params.id, res);
    if (!req.params.id) return;
    const rider = await pool.query('SELECT * FROM riders WHERE id = $1', [req.params.id]);
    if (!rider.rows.length) return res.status(404).json({ error: 'rider not found' });
    const stats = await pool.query('SELECT * FROM rider_stats WHERE rider_id = $1', [req.params.id]);
    const history = await pool.query(
      `SELECT rr.*, c.name AS class_name, e.name AS event_name, c.class_date, h.name AS horse, h.slug AS horse_slug
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
    // Privacy opt-out: mask the profile row itself (history/partnership rows
    // are masked by the generic response wrapper). Admins see real names.
    const sets = req.authUser?.role === 'ADMIN' ? null : await privacy.privacySets(pool);
    res.json({ data: privacy.maskRiderRow(rider.rows[0], sets), stats: stats.rows[0] || null, history: history.rows, partnerships: partners.rows });
  }));

  // ---- Stable-lite: training & health per horse ----
  app.get('/horses/:id/training', asyncH(async (req, res) => {
    req.params.id = await resolveId('horses', req.params.id, res);
    if (!req.params.id) return;
    const { rows } = await pool.query(
      `SELECT t.*, r.name AS rider FROM training_records t
       LEFT JOIN riders r ON r.id = t.rider_id
       WHERE t.horse_id = $1 ORDER BY t.date DESC LIMIT 50`, [req.params.id]);
    res.json({ data: rows });
  }));

  app.post('/horses/:id/training', asyncH(async (req, res) => {
    req.params.id = await resolveId('horses', req.params.id, res);
    if (!req.params.id) return;
    if (!req.authUser) return res.status(401).json({ error: 'login required' });
    const { rider_id, date, type, intensity, notes } = req.body || {};
    if (!date || !type) return res.status(400).json({ error: 'need {date, type}' });
    if (intensity && !['Low', 'Medium', 'High'].includes(intensity)) {
      return res.status(400).json({ error: 'intensity must be Low|Medium|High' });
    }
    const horse = await pool.query('SELECT 1 FROM horses WHERE id = $1', [req.params.id]);
    if (!horse.rows.length) return res.status(404).json({ error: 'horse not found' });
    const { rows } = await pool.query(
      `INSERT INTO training_records (horse_id, rider_id, date, type, intensity, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, rider_id || null, date, type, intensity || null, notes || null, req.authUser.id]
    );
    audit(req, 'training.create', 'horse', req.params.id, { id: rows[0].id, type, date });
    res.status(201).json({ data: rows[0] });
  }));

  // Delete own entries; legacy rows (created_by NULL) and others' rows: admin only.

  app.delete('/training/:id', asyncH(async (req, res) => {
    if (!(await ownOrAdmin(req, res, 'training_records', 'training entry'))) return;
    await pool.query('DELETE FROM training_records WHERE id = $1', [req.params.id]);
    audit(req, 'training.delete', 'training', req.params.id, {});
    res.json({ ok: true });
  }));

  app.get('/horses/:id/health', asyncH(async (req, res) => {
    req.params.id = await resolveId('horses', req.params.id, res);
    if (!req.params.id) return;
    const { rows } = await pool.query(
      'SELECT * FROM health_records WHERE horse_id = $1 ORDER BY date DESC LIMIT 50', [req.params.id]);
    res.json({ data: rows });
  }));

  app.post('/horses/:id/health', asyncH(async (req, res) => {
    req.params.id = await resolveId('horses', req.params.id, res);
    if (!req.params.id) return;
    if (!req.authUser) return res.status(401).json({ error: 'login required' });
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
      `INSERT INTO health_records (horse_id, date, category, description, provider, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, date, category, description, provider || null, req.authUser.id]
    );
    audit(req, 'health.create', 'horse', req.params.id, { id: rows[0].id, category, date });
    res.status(201).json({ data: rows[0] });
  }));

  app.delete('/health/:id', asyncH(async (req, res) => {
    if (!(await ownOrAdmin(req, res, 'health_records', 'health entry'))) return;
    await pool.query('DELETE FROM health_records WHERE id = $1', [req.params.id]);
    audit(req, 'health.delete', 'health', req.params.id, {});
    res.json({ ok: true });
  }));

  // ---- Horse timeline: training + health + competition in one feed ----
  app.get('/horses/:id/timeline', asyncH(async (req, res) => {
    req.params.id = await resolveId('horses', req.params.id, res);
    if (!req.params.id) return;
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
    if (!['horse', 'rider', 'combination', 'event'].includes(type) || !a || !b) {
      return res.status(400).json({ error: 'use ?type=horse|rider|combination|event&a=<id>&b=<id>' });
    }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (type === 'event') {
      if (!uuid.test(a) || !uuid.test(b)) {
        return res.status(404).json({ error: 'one or both ids not found' });
      }
      const vis = await visSql();
      const { rows: erows } = await pool.query(
        `SELECT e.id AS event_id, e.name AS event, e.season, e.venue, e.region,
           e.date_start, e.date_end, COUNT(*)::INT AS rounds,
           SUM(rr.clear_round::INT)::INT AS clears,
           ROUND(100.0 * AVG(rr.clear_round::INT), 1) AS clear_pct,
           ROUND(AVG(rr.total_faults), 2) AS avg_faults,
           COUNT(*) FILTER (WHERE rr.finish_place = 1)::INT AS wins,
           COUNT(DISTINCT rr.class_id)::INT AS classes,
           MIN(rr.finish_place) AS best_place
         FROM round_results rr JOIN events e ON e.id = rr.event_id
         JOIN classes c ON c.id = rr.class_id
         WHERE rr.event_id = ANY($1::uuid[]) AND ${vis}
         GROUP BY e.id, e.name, e.season, e.venue, e.region, e.date_start, e.date_end`,
        [[a, b]]
      );
      if (erows.length < 2) return res.status(404).json({ error: 'one or both ids not found' });
      const byId = Object.fromEntries(erows.map((r) => [r.event_id, r]));
      return res.json({ a: byId[a], b: byId[b] });
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

  // ---- Age-group peers (PRD §9: comparison with horses of similar age) ----
  // ?horse_id= — same-age band (±1 year) with career stats for benchmarking.
  app.get('/peers', asyncH(async (req, res) => {
    const { horse_id } = req.query;
    if (!horse_id) return res.status(400).json({ error: 'use ?horse_id=<id or slug>' });
    const id = await resolveId('horses', horse_id, res);
    if (!id) return;
    const sub = await pool.query('SELECT id, name, age FROM horses WHERE id = $1', [id]);
    if (!sub.rows.length) return res.status(404).json({ error: 'horse not found' });
    const age = sub.rows[0].age;
    if (age === null || age === undefined) {
      return res.status(404).json({ error: 'age unknown for this horse' });
    }
    const { rows } = await pool.query(
      `SELECT h.id AS horse_id, h.name AS horse, h.age,
         s.starts, s.clears, s.clear_pct, s.avg_faults, s.wins
       FROM horses h JOIN horse_stats s ON s.horse_id = h.id
       WHERE h.age BETWEEN $1 AND $2
       ORDER BY s.clear_pct DESC NULLS LAST, s.avg_faults ASC`,
      [age - 1, age + 1]
    );
    const withStats = rows.filter((r) => r.starts !== null);
    const avg = (k) => withStats.length
      ? withStats.reduce((t, r) => t + Number(r[k]), 0) / withStats.length : null;
    // Privacy opt-out: subject row carries a raw name (peers rows are
    // masked by the generic response wrapper). Admins see real names.
    const psets = req.authUser?.role === 'ADMIN' ? null : await privacy.privacySets(pool);
    const subject = { ...sub.rows[0] };
    if (psets && psets.horseIds.has(subject.id)) {
      subject.name = privacy.pseudo('Horse', subject.id);
      subject.is_anonymous = true;
    }
    res.json({
      subject,
      band: [age - 1, age + 1],
      peers: rows,
      peer_count: rows.length,
      avg_clear_pct: avg('clear_pct') === null ? null : Math.round(avg('clear_pct') * 10) / 10,
      avg_faults: avg('avg_faults') === null ? null : Math.round(avg('avg_faults') * 100) / 100,
    });
  }));

  // ---- Series standings (NZ series points, PRD §7.5) ----
  app.get('/series', asyncH(async (req, res) => {
    // Computed from our own results (series_info registry + live counts),
    // not only imported official standings (series_standings may be empty).
    const { rows } = await pool.query(
      `WITH keys AS (
        SELECT series_key FROM series_info
        UNION
        SELECT DISTINCT c.series_key FROM classes c WHERE c.series_key IS NOT NULL
      ),
      live AS (
        SELECT c.series_key,
          COUNT(DISTINCT c.id)::INT AS classes,
          COUNT(DISTINCT c.event_id)::INT AS events,
          COUNT(rr.id)::INT AS starts,
          COUNT(DISTINCT (rr.horse_id, rr.rider_id))::INT AS entries,
          ARRAY_AGG(DISTINCT e.season) FILTER (WHERE e.season IS NOT NULL) AS seasons,
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT e.name) FILTER (WHERE e.name IS NOT NULL), NULL) AS event_names
        FROM classes c
        LEFT JOIN round_results rr ON rr.class_id = c.id AND class_id_visible(rr.class_id)
        LEFT JOIN events e ON e.id = c.event_id
        GROUP BY 1
      )
      SELECT k.series_key,
        COALESCE(i.display_name,
          INITCAP(REPLACE(k.series_key, '-', ' '))) AS series_name,
        COALESCE(l.classes, 0) AS classes,
        COALESCE(l.events, 0) AS events,
        COALESCE(l.starts, 0) AS starts,
        COALESCE(l.entries, 0) AS entries,
        COALESCE(l.seasons, '{}') AS seasons,
        COALESCE(l.event_names, '{}') AS event_names,
        (i.auto_calc IS NOT FALSE) AS auto_calc
      FROM keys k
      LEFT JOIN series_info i ON i.series_key = k.series_key
      LEFT JOIN live l ON l.series_key = k.series_key
      ORDER BY l.starts DESC NULLS LAST, k.series_key`
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

  // ---- Weekend best (opening-page NEWS): top performance of the latest
  // results weekend, grouped by rider category (default) or scoring division
  // (?by=division). Categories come from the dedicated Categories table
  // (Admin menu); divisions come from the live scoring rules (active version,
  // else built-in v0.3 defaults). Window = latest class date with results
  // minus 6 days (robust to sparse imports). Names flow through the privacy
  // wrapper like every response.
  app.get('/news/weekend', asyncH(async (req, res) => {
    const vis = await visSql();
    const by = req.query.by === 'division' ? 'division' : 'category';
    const cats = by === 'division' ? [] : await loadWeekendCats();
    const { rows } = await pool.query(
      `WITH mx AS (
         SELECT MAX(c.class_date)::DATE AS d1
         FROM round_results rr JOIN classes c ON c.id = rr.class_id
       ),
       win AS (SELECT (SELECT d1 FROM mx) - 6 AS d0, (SELECT d1 FROM mx) AS d1)
        SELECT rr.horse_id, rr.rider_id, rr.finish_place, rr.total_faults,
          c.id AS class_id, c.name AS class_name, c.class_type, c.class_date,
          c.rider_category AS class_cat, c.is_world_cup,
          COALESCE(rr.height_cm, c.height_cm) AS h,
         e.id AS event_id, e.name AS event_name, e.slug AS event_slug,
         h.name AS horse, h.slug AS horse_slug,
         r.name AS rider, r.slug AS rider_slug, r.series_category AS rider_cat,
         (SELECT COUNT(*)::INT FROM round_results rr2 WHERE rr2.class_id = c.id) AS field_size
       FROM round_results rr
       JOIN classes c ON c.id = rr.class_id
       JOIN events e ON e.id = rr.event_id
       JOIN horses h ON h.id = rr.horse_id
       JOIN riders r ON r.id = rr.rider_id, win w
       WHERE c.class_date BETWEEN w.d0 AND w.d1 AND ${vis}`,
    );
    // Category priority: rider's own category > the class's category field >
    // fuzzy class-name match (last resort — class names have no standard).
    // Own/field values match master keys first (exact, case-insensitive);
    // legacy label values keep resolving via the old substring guessing.
    const norm = (s) => String(s || '').toLowerCase().trim();
    const keyForLabel = (value) => {
      const v = norm(value);
      if (!v) return null;
      const byKey = cats.find((c) => norm(c.key) === v);
      if (byKey) return byKey.key;
      return (cats.find((c) => norm(c.label) === v || norm(c.key) === v
        || norm(c.label).includes(v) || v.includes(norm(c.label))) || {}).key || null;
    };
    // Top per bucket: highest height, then best placing, then fewest faults.
    const better = (a, b) =>
      ((b.h ?? -1) - (a.h ?? -1)) ||
      ((a.finish_place ?? 99) - (b.finish_place ?? 99)) ||
      (Number(a.total_faults ?? 99) - Number(b.total_faults ?? 99));

    // ---- Division mode: best performance in each scoring division ----
    if (by === 'division') {
      const { divisionFor } = require('../scoring/calc');
      const { DEFAULTS } = require('../scoring/defaults');
      const { activeRules } = require('./scoring');
      const rules = (await activeRules().catch(() => null)) || DEFAULTS;
      const divMeta = (key) => {
        if (key === 'world_cup') {
          return { key, label: 'World Cup', color: rules.worldCup?.color || '#8E7CFF' };
        }
        const d = (rules.divisions || []).find((x) => x.key === key);
        return d ? { key: d.key, label: d.label, color: d.color } : null;
      };
      const best = new Map();
      for (const r of rows) {
        const key = divisionFor(r.h, r.is_world_cup, rules);
        if (!key) continue;
        const meta = divMeta(key);
        if (!meta) continue;
        const cur = best.get(key);
        if (!cur || better(r, cur) < 0) best.set(key, { ...r, ...meta });
      }
      const divs = (rules.divisions || []).map((d) => ({ key: d.key, label: d.label, color: d.color }));
      if ([...best.keys()].includes('world_cup') && !divs.some((d) => d.key === 'world_cup')) {
        divs.push({ key: 'world_cup', label: 'World Cup', color: rules.worldCup?.color || '#8E7CFF' });
      }
      const order = Object.fromEntries(divs.map((d, i) => [d.key, i]));
      const data = [...best.entries()]
        .sort((a, b) => (order[a[0]] ?? 9) - (order[b[0]] ?? 9))
        .map(([, v]) => ({
          key: v.key, title: v.label, label: v.label, color: v.color,
          horse: v.horse, rider: v.rider, horse_id: v.horse_id, rider_id: v.rider_id,
          horse_slug: v.horse_slug, rider_slug: v.rider_slug,
          class_name: v.class_name, class_id: v.class_id,
          event_name: v.event_name, event_id: v.event_id, event_slug: v.event_slug,
          height_cm: v.h, finish_place: v.finish_place, total_faults: v.total_faults,
        }));
      const { rows: wrows } = await pool.query(
        `SELECT (MAX(c.class_date)::DATE - 6) AS d0, MAX(c.class_date)::DATE AS d1
         FROM round_results rr JOIN classes c ON c.id = rr.class_id`);
      return res.json({ window: wrows[0] || null, by, divisions: divs, data });
    }

    // ---- Category mode (default) ----
    // One rider holds at most one bucket: a rider without their own category
    // can otherwise top two buckets from two different classes (e.g. an open
    // win + a Young Rider series win). The rider's bucket is the bucket of
    // their single best round (own-category rounds already resolve there by
    // the priority below, so setting the rider's category fixes it properly).
    const viaRank = (r) => (r.via === 'rider' ? 0 : 1);
    // Bucket resolution — curated sources only, no guessing:
    // 1. the rider's own category (Admin → Riders), 2. the class's explicit
    // rider_category field (Admin → Classes). Rounds with neither are
    // skipped: the bucket stays empty rather than showing a guessed winner.
    const byRider = new Map();
    for (const r of rows) {
      const ownKey = keyForLabel(r.rider_cat);
      const fieldKey = ownKey ? null : keyForLabel(r.class_cat);
      const m = ownKey ? cats.find((c) => c.key === ownKey)
        : fieldKey ? cats.find((c) => c.key === fieldKey)
        : null;
      if (!m) continue;
      const cat = { ...m, via: ownKey ? 'rider' : 'class-field' };
      const arr = byRider.get(r.rider_id) || [];
      arr.push({ ...r, key: cat.key, title: cat.title, label: cat.label, via: cat.via });
      byRider.set(r.rider_id, arr);
    }
    const best = new Map();
    for (const rounds of byRider.values()) {
      rounds.sort((a, b) => better(a, b) || (viaRank(a) - viaRank(b)));
      const r = rounds[0];
      const cur = best.get(r.key);
      if (!cur || better(r, cur) < 0) best.set(r.key, r);
    }
    const order = Object.fromEntries(cats.map((c, i) => [c.key, i]));
    const data = [...best.entries()]
      .sort((a, b) => (order[a[0]] ?? 9) - (order[b[0]] ?? 9))
      .map(([, v]) => ({
        key: v.key, title: v.title, label: v.label,
        horse: v.horse, rider: v.rider, horse_id: v.horse_id, rider_id: v.rider_id,
        horse_slug: v.horse_slug, rider_slug: v.rider_slug,
        class_name: v.class_name, class_id: v.class_id,
        event_name: v.event_name, event_id: v.event_id, event_slug: v.event_slug,
        height_cm: v.h, finish_place: v.finish_place, total_faults: v.total_faults,
      }));
    const { rows: wrows } = await pool.query(
      `SELECT (MAX(c.class_date)::DATE - 6) AS d0, MAX(c.class_date)::DATE AS d1
       FROM round_results rr JOIN classes c ON c.id = rr.class_id`);
    res.json({ window: wrows[0] || null, by, data });
  }));

  // ---- Trends (monthly aggregates for charts) ----
  app.get('/trends/circuit', asyncH(async (req, res) => {
    const f = await roundFiltersVis(req.query);
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

  // ---- Circuit totals (exact counts for dashboard/about headers).
  // Same ?season=&region=&arena=&height_min=&height_max=&since= filters as
  // /trends/circuit, but aggregated over the whole slice — never capped by paging.
  app.get('/stats/circuit', asyncH(async (req, res) => {
    const f = await roundFiltersVis(req.query);
    const { rows } = await pool.query(
      `SELECT COUNT(*)::INT AS rounds,
          COALESCE(SUM(rr.clear_round::INT), 0)::INT AS clears,
          ROUND(100.0 * AVG(rr.clear_round::INT), 1) AS clear_pct,
          ROUND(AVG(rr.total_faults), 2) AS avg_faults,
          COUNT(DISTINCT rr.horse_id)::INT AS horses,
          COUNT(DISTINCT rr.rider_id)::INT AS riders,
          COUNT(DISTINCT rr.event_id)::INT AS events,
          COUNT(DISTINCT c.id)::INT AS classes,
          (SELECT MAX(created_at) FROM import_logs) AS last_import
        FROM round_results rr JOIN classes c ON c.id = rr.class_id
        JOIN events e ON e.id = rr.event_id
        ${f.clause}`,
      f.params
    );
    res.json({ data: rows[0] });
  }));

  // ---- Series leaders: top horse per official series_key (visible only).
  app.get('/series/leaders', asyncH(async (req, res) => {
    const { rows } = await pool.query(
      `WITH per_horse AS (
        SELECT c.series_key, h.id AS horse_id, h.name AS horse,
          h.slug AS horse_slug, SUM(rr.points)::INT AS pts,
          COUNT(rr.id)::INT AS starts
        FROM round_results rr
        JOIN classes c ON c.id = rr.class_id
        JOIN horses h ON h.id = rr.horse_id
        WHERE c.series_key IS NOT NULL AND class_id_visible(rr.class_id)
        GROUP BY 1, 2, 3, 4
      ),
      ranked AS (
        SELECT *, ROW_NUMBER() OVER (
            PARTITION BY series_key ORDER BY pts DESC, starts DESC) AS rk,
          COUNT(*) OVER (PARTITION BY series_key)::INT AS horses
        FROM per_horse
      )
      SELECT r.series_key,
        COALESCE(i.display_name,
          INITCAP(REPLACE(r.series_key, '-', ' '))) AS series_name,
        r.horse_id, r.horse, r.horse_slug,
        r.pts AS total_points, r.starts, r.horses,
        (SELECT COUNT(DISTINCT c2.id) FROM classes c2
          WHERE c2.series_key = r.series_key)::INT AS classes
      FROM ranked r
      LEFT JOIN series_info i ON i.series_key = r.series_key
      WHERE r.rk = 1 ORDER BY r.series_key`
    );
    res.json({ data: rows });
  }));

  app.get('/horses/:id/trend', asyncH(async (req, res) => {
    req.params.id = await resolveId('horses', req.params.id, res);
    if (!req.params.id) return;
    const vis = await visSql();
    const { rows } = await pool.query(
      `SELECT to_char(date_trunc('month', c.class_date), 'Mon') AS month,
         date_trunc('month', c.class_date) AS m,
         COUNT(*)::INT AS starts,
         ROUND(100.0 * AVG(rr.clear_round::INT), 1) AS clear_pct,
         ROUND(AVG(rr.total_faults), 2) AS avg_faults
       FROM round_results rr JOIN classes c ON c.id = rr.class_id
       WHERE rr.horse_id = $1 AND c.class_date IS NOT NULL AND ${vis}
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
    if (req.query.type) push('cs.class_type = ?', req.query.type);
    if (req.query.format) push('cs.format = ?', req.query.format);
    if (req.query.height_min) push('cs.height_cm >= ?', Number(req.query.height_min));
    if (req.query.height_max) push('cs.height_cm <= ?', Number(req.query.height_max));
    if (req.query.series_key) push('cs.series_key = ?', req.query.series_key);
    if (req.query.q) { params.push(`%${req.query.q}%`); params.push(`%${req.query.q}%`);
      conds.push(`(cs.class ILIKE $${params.length - 1} OR cs.event ILIKE $${params.length})`); }
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
    req.params.id = await resolveId('events', req.params.id, res);
    if (!req.params.id) return;
    const ev = await pool.query('SELECT * FROM events WHERE id = $1', [req.params.id]);
    if (!ev.rows.length) return res.status(404).json({ error: 'event not found' });
    const e = ev.rows[0];
    // Independent queries — run concurrently. Horse/rider/partnership top lists
    // are derived from `rounds` client-side, so no extra aggregate queries here.
    // Hidden classes (switched off) are excluded from rounds; class_stats (view)
    // already hides them. The counts below drive the transparency note in the UI.
    const vis = await visSql();
    const [classes, rounds, weather, hidden] = await Promise.all([
      pool.query(
        'SELECT * FROM class_stats WHERE class_id IN (SELECT id FROM classes WHERE event_id = $1)',
        [e.id]
      ),
      pool.query(
        `SELECT rr.id, rr.class_id, rr.horse_id, rr.rider_id,
         h.name AS horse, h.slug AS horse_slug, r.name AS rider, r.slug AS rider_slug,
         c.name AS class_name, c.class_date, COALESCE(rr.height_cm, c.height_cm) AS height_cm,
         rr.jump_faults, rr.total_faults, rr.time_seconds, rr.finish_place, rr.clear_round,
         rr.status, rr.notes, rr.points,
         rr.round2_faults, rr.jumpoff_faults, rr.jumpoff_time_seconds, rr.prize_money
        FROM round_results rr
        JOIN horses h ON h.id = rr.horse_id
        JOIN riders r ON r.id = rr.rider_id
        JOIN classes c ON c.id = rr.class_id
        WHERE rr.event_id = $1 AND ${vis}
        ORDER BY c.class_date, c.name, rr.finish_place NULLS LAST`,
        [e.id]
      ),
      pool.query(
        `SELECT * FROM weather_cache WHERE venue_norm = lower(trim($1))
        ORDER BY date`,
        [e.venue]
      ),
      pool.query(
        `SELECT COUNT(*)::INT AS hidden_classes,
          (SELECT COUNT(*)::INT FROM round_results rr JOIN classes c ON c.id = rr.class_id
            WHERE rr.event_id = $1 AND NOT (${vis})) AS hidden_rounds
        FROM classes c WHERE c.event_id = $1 AND NOT (${vis})`,
        [e.id]
      ),
    ]);
    res.json({
      event: e, classes: classes.rows, rounds: rounds.rows,
      weather: weather.rows, hidden: hidden.rows[0],
    });
  }));

  // ---- Arena aggregates (surface intelligence) ----
  app.get('/arenas', asyncH(async (req, res) => {
    const vis = await visSql();
    const { rows } = await pool.query(
      `WITH a AS (
         SELECT COALESCE(c.arena_type, e.arena_type) AS arena, COUNT(*)::INT AS rounds,
           ROUND(100.0 * AVG(rr.clear_round::INT), 1) AS clear_pct,
           ROUND(AVG(rr.total_faults), 2) AS avg_faults
         FROM round_results rr JOIN events e ON e.id = rr.event_id
         JOIN classes c ON c.id = rr.class_id
         WHERE COALESCE(c.arena_type, e.arena_type) IS NOT NULL AND ${vis} GROUP BY 1
       ),
       top AS (
         SELECT DISTINCT ON (COALESCE(c.arena_type, e.arena_type)) COALESCE(c.arena_type, e.arena_type) AS arena, h.name AS horse
         FROM round_results rr
         JOIN events e ON e.id = rr.event_id
         JOIN classes c ON c.id = rr.class_id
         JOIN horses h ON h.id = rr.horse_id
         WHERE COALESCE(c.arena_type, e.arena_type) IS NOT NULL AND ${vis}
        GROUP BY COALESCE(c.arena_type, e.arena_type), h.id, h.name HAVING COUNT(*) >= 3
        ORDER BY COALESCE(c.arena_type, e.arena_type), AVG(rr.clear_round::INT) DESC
       )
       SELECT a.*, t.horse AS top_horse FROM a
       LEFT JOIN top t ON t.arena = a.arena ORDER BY a.rounds DESC`
    );
    res.json({ data: rows });
  }));

  app.get('/rankings/movement', asyncH(async (req, res) => {
    const type = req.query.type === 'rider' ? 'rider' : 'horse';
    const periods = (await pool.query(
      'SELECT DISTINCT period FROM ranking_snapshots WHERE entity_type = $1 ORDER BY period DESC LIMIT 2', [type])).rows;
    if (periods.length < 2) return res.json({ data: {}, periods: periods.map((p) => p.period) });
    const [cur, prev] = periods.map((p) => p.period);
    const { rows } = await pool.query(
      `SELECT c.entity_id AS id, c.rank AS rank, p.rank AS prev
       FROM ranking_snapshots c LEFT JOIN ranking_snapshots p
         ON p.entity_type = c.entity_type AND p.entity_id = c.entity_id AND p.period = $3
       WHERE c.entity_type = $1 AND c.period = $2`, [type, cur, prev]);
    const data = {};
    for (const r of rows) data[r.id] = r.prev === null ? null : r.prev - r.rank;
    res.json({ data, periods: [cur, prev] });
  }));

  // ---- Venue detail: events at venue + top performers there ----
  app.get('/venues/:id', asyncH(async (req, res) => {
    const v = await pool.query('SELECT * FROM venues WHERE id = $1', [req.params.id]);
    if (!v.rows.length) return res.status(404).json({ error: 'venue not found' });
    const vis = await visSql();
    const events = await pool.query(
      `SELECT e.*, (SELECT COUNT(*)::INT FROM classes c WHERE c.event_id = e.id AND ${vis}) AS class_count,
         (SELECT COUNT(*)::INT FROM round_results rr JOIN classes c ON c.id = rr.class_id WHERE rr.event_id = e.id AND ${vis}) AS round_count
       FROM events e WHERE e.venue_id = $1
         AND (EXISTS (SELECT 1 FROM classes c WHERE c.event_id = e.id) OR EXISTS (SELECT 1 FROM round_results rr WHERE rr.event_id = e.id))
       ORDER BY e.date_start DESC`, [req.params.id]);
    const rounds = events.rows.length
      ? (await pool.query(`SELECT COUNT(*)::INT AS n FROM round_results rr JOIN events e ON e.id = rr.event_id JOIN classes c ON c.id = rr.class_id WHERE e.venue_id = $1 AND ${vis}`, [req.params.id])).rows[0].n : 0;
    const topH = await pool.query(
      `SELECT h.id AS horse_id, h.name AS horse, h.slug AS horse_slug, COUNT(*)::INT AS starts,
         ROUND(100.0 * AVG(rr.clear_round::INT), 1) AS clear_pct
       FROM round_results rr JOIN horses h ON h.id = rr.horse_id
       JOIN events e ON e.id = rr.event_id JOIN classes c ON c.id = rr.class_id
       WHERE e.venue_id = $1 AND ${vis}
       GROUP BY h.id, h.name, h.slug HAVING COUNT(*) >= 2 ORDER BY clear_pct DESC LIMIT 5`, [req.params.id]);
    const topR = await pool.query(
      `SELECT r.id AS rider_id, r.name AS rider, r.slug AS rider_slug, COUNT(*)::INT AS starts,
         ROUND(100.0 * AVG(rr.clear_round::INT), 1) AS clear_pct
       FROM round_results rr JOIN riders r ON r.id = rr.rider_id
       JOIN events e ON e.id = rr.event_id JOIN classes c ON c.id = rr.class_id
       WHERE e.venue_id = $1 AND ${vis}
       GROUP BY r.id, r.name, r.slug HAVING COUNT(*) >= 2 ORDER BY clear_pct DESC LIMIT 5`, [req.params.id]);
    res.json({ data: { ...v.rows[0], event_count: events.rows.length, rounds, events: events.rows, topHorses: topH.rows, topRiders: topR.rows } });
  }));

  // eslint-disable-next-line no-unused-vars

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

  // ---- Corrections inbox (public form + admin curation) ----
  app.post('/corrections', asyncH(async (req, res) => {
    if (throttled(req.ip || 'x')) return res.status(429).json({ error: 'too many attempts, try later' });
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

  // ---- Surface splits (arena × surface per horse/rider) ----
  app.get('/horses/:id/splits', asyncH(async (req, res) => {
    req.params.id = await resolveId('horses', req.params.id, res);
    if (!req.params.id) return;
    const { rows } = await pool.query(
      'SELECT arena_type, surface, starts, clears, clear_pct, avg_faults FROM horse_surface_stats WHERE horse_id = $1 ORDER BY starts DESC',
      [req.params.id]);
    res.json({ data: rows });
  }));

  app.get('/riders/:id/splits', asyncH(async (req, res) => {
    req.params.id = await resolveId('riders', req.params.id, res);
    if (!req.params.id) return;
    const { rows } = await pool.query(
      'SELECT arena_type, surface, starts, clears, clear_pct, avg_faults FROM rider_surface_stats WHERE rider_id = $1 ORDER BY starts DESC',
      [req.params.id]);
    res.json({ data: rows });
  }));

  // ---- Venues ----
  app.get('/venues', asyncH(async (req, res) => {
    const q = `%${String(req.query.q || '').trim()}%`;
    const vis = await visSql();
    const { rows } = await pool.query(
      `SELECT v.*, (SELECT COUNT(*)::INT FROM events e WHERE e.venue_id = v.id
         AND (EXISTS (SELECT 1 FROM classes c WHERE c.event_id = e.id) OR EXISTS (SELECT 1 FROM round_results rr WHERE rr.event_id = e.id))) AS events,
         (SELECT COUNT(*)::INT FROM round_results rr JOIN events e ON e.id = rr.event_id JOIN classes c ON c.id = rr.class_id WHERE e.venue_id = v.id AND ${vis}) AS rounds
       FROM venues v ${req.query.q ? 'WHERE v.name ILIKE $1' : ''} ORDER BY v.name LIMIT 100`,
      req.query.q ? [q] : []);
    res.json({ data: rows });
  }));

  // ---- Seasons master (single source of truth for season keys/labels) ----
  app.get('/seasons', asyncH(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT key, label, date_start, date_end, is_current,
        (SELECT COUNT(*)::INT FROM events e WHERE e.season = seasons.key) AS events
       FROM seasons ORDER BY key DESC`);
    res.json({ data: rows });
  }));

  // ---- Series engine (spec v2 S5): matrix, completed/remaining, drops, recalc ----
  app.get('/series/:key/detail', asyncH(async (req, res) => {
    const key = req.params.key;
    const info = (await pool.query('SELECT * FROM series_info WHERE series_key = $1', [key])).rows[0] || null;
    let standings, events, source;
    if (info && info.auto_calc) {
      const vis = await visSql();
      // ESNZ series config (bestOf/sliding/sources) from the active esnz
      // version; falls back to series_info.best_of when unconfigured.
      // (60s cache — brief staleness after activation is acceptable.)
      const seriesCfg = await loadEsnzSeries();
      const cfg = (seriesCfg || {})[key] || {};
      const isBreeder = cfg.seasonTotal === true;
      // Breeder (Annex 11 §2-4): season total over ALL series classes except
      // Stallion/Mare/8YO, grouped by recorded breeder. NZ-bred approximated
      // by breeder presence (explicit §2.1 rule); country refinement later.
      const excl = Array.isArray(cfg.excludeSeries) ? cfg.excludeSeries : [];
      const keys = Array.isArray(cfg.sources) && cfg.sources.length ? cfg.sources : [key];
      const { rows } = isBreeder ? await pool.query(
        `SELECT h.breeder AS breeder, e.name AS event, e.id AS event_id,
           MIN(c.class_date) AS event_date, SUM(rr.points)::INT AS pts, COUNT(*)::INT AS rounds
         FROM round_results rr
         JOIN classes c ON c.id = rr.class_id
         JOIN events e ON e.id = rr.event_id
         JOIN horses h ON h.id = rr.horse_id
         WHERE c.series_key IS NOT NULL AND NOT (c.series_key = ANY($1))
           AND h.breeder IS NOT NULL AND h.breeder <> '' AND ${vis}
         GROUP BY h.breeder, e.name, e.id`, [excl])
      : await pool.query(
        `SELECT r.name AS rider, h.name AS horse, e.name AS event, e.id AS event_id,
           MIN(c.class_date) AS event_date, SUM(rr.points)::INT AS pts, COUNT(*)::INT AS rounds
         FROM round_results rr
         JOIN classes c ON c.id = rr.class_id
         JOIN events e ON e.id = rr.event_id
         JOIN riders r ON r.id = rr.rider_id
         JOIN horses h ON h.id = rr.horse_id
         WHERE c.series_key = ANY($1) AND ${vis}
         GROUP BY r.name, h.name, e.name, e.id`, [keys]);
      const byCombo = {};
      for (const row of rows) {
        const k = isBreeder ? `breeder||${row.breeder}` : `${row.rider}||${row.horse}`;
        (byCombo[k] ||= (isBreeder ? { breeder: row.breeder, events: {}, rounds: 0 }
          : { rider: row.rider, horse: row.horse, events: {}, rounds: 0 }));
        byCombo[k].events[row.event] = (byCombo[k].events[row.event] || 0) + row.pts;
        byCombo[k].rounds += row.rounds;
      }
      const n = (() => {
        if (cfg && (cfg.bestOf || cfg.sliding || cfg.seasonTotal)) {
          if (cfg.seasonTotal) return null; // breeder: count everything
          const held = new Set(rows.map((r) => r.event_id)).size;
          return seriesCountFor(cfg, held);
        }
        return info.best_of || null;
      })();
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
};
