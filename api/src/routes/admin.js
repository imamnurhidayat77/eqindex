const pool = require('../db');
const privacy = require('../privacy');
const { asyncH } = require('../lib/async');
const { paging } = require('../lib/http');
const { audit } = require('../lib/audit');
const { needRole } = require('../lib/auth');
const { bustCache, bustPublic } = require('../middleware/cache');
const { bustVisibility, excludedClassTypes } = require('../lib/filters');

module.exports = function mountAdminRoutes(app) {
  // ---- Rank snapshots: capture today's points ranks (idempotent per day) ----
  app.post('/admin/snapshots', needRole('ADMIN'), asyncH(async (req, res) => {
    await captureSnapshots();
    audit(req, 'admin.snapshot', 'system', null, {});
    res.json({ ok: true });
  }));

  async function captureSnapshots() {
    try {
      const h = await pool.query(
        'SELECT horse_id AS id, ROW_NUMBER() OVER (ORDER BY total_points DESC) AS rank, total_points AS points FROM horse_point_stats WHERE total_starts > 0');
      for (const r of h.rows) {
        await pool.query(
          `INSERT INTO ranking_snapshots (entity_type, entity_id, period, rank, points)
           VALUES ('horse', $1, CURRENT_DATE, $2, $3)
           ON CONFLICT (entity_type, entity_id, period) DO UPDATE SET rank = EXCLUDED.rank, points = EXCLUDED.points`,
          [r.id, r.rank, r.points]);
      }
      const rd = await pool.query(
        'SELECT rider_id AS id, ROW_NUMBER() OVER (ORDER BY total_points DESC) AS rank, total_points AS points FROM rider_point_stats WHERE total_starts > 0');
      for (const r of rd.rows) {
        await pool.query(
          `INSERT INTO ranking_snapshots (entity_type, entity_id, period, rank, points)
           VALUES ('rider', $1, CURRENT_DATE, $2, $3)
           ON CONFLICT (entity_type, entity_id, period) DO UPDATE SET rank = EXCLUDED.rank, points = EXCLUDED.points`,
          [r.id, r.rank, r.points]);
      }
    } catch { /* best effort */ }
  }

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

  // ---- Audit activity feed (admin) ----
  app.get('/admin/activity', needRole('ADMIN'), asyncH(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 200);
    const conds = [], params = [];
    if (req.query.action) { params.push(req.query.action); conds.push(`action = $${params.length}`); }
    if (req.query.entity) { params.push(req.query.entity); conds.push(`entity_type = $${params.length}`); }
    if (req.query.actor) { params.push(`%${req.query.actor}%`); conds.push(`actor ILIKE $${params.length}`); }
    if (req.query.since && /^\d{4}-\d{2}-\d{2}$/.test(req.query.since)) { params.push(req.query.since); conds.push(`created_at >= $${params.length}::date`); }
    if (req.query.until && /^\d{4}-\d{2}-\d{2}$/.test(req.query.until)) { params.push(req.query.until); conds.push(`created_at < ($${params.length}::date + INTERVAL '1 day')`); }
    params.push(limit);
    const { rows } = await pool.query(
      `SELECT * FROM entity_audit ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
       ORDER BY created_at DESC LIMIT $${params.length}`, params);
    res.json({ data: rows });
  }));

  // Distinct audit actions for the admin filter dropdown.
  app.get('/admin/activity/actions', needRole('ADMIN'), asyncH(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT action, COUNT(*)::INT AS n FROM entity_audit GROUP BY action ORDER BY n DESC LIMIT 100');
    res.json({ data: rows });
  }));

  // Daily platform stats for the admin overview charts: competition rounds
  // (by class date) + imported rows (by log date) over the trailing window.
  app.get('/admin/stats/daily', needRole('ADMIN'), asyncH(async (req, res) => {
    const days = Math.min(Math.max(parseInt(req.query.days || '90', 10) || 90, 7), 365);
    const { rows } = await pool.query(
      `WITH cal AS (
         SELECT (CURRENT_DATE - (s || ' days')::INTERVAL)::DATE AS day
         FROM generate_series(0, $1 - 1) s
       ),
       r AS (
         SELECT c.class_date AS day, COUNT(*)::INT AS rounds
         FROM round_results rr JOIN classes c ON c.id = rr.class_id
         WHERE c.class_date >= CURRENT_DATE - ($1 - 1)
         GROUP BY 1
       ),
       im AS (
         SELECT created_at::DATE AS day, SUM(rows_ok)::INT AS imported
         FROM import_logs
         WHERE created_at >= CURRENT_DATE - ($1 - 1)
         GROUP BY 1
       )
       SELECT cal.day, COALESCE(r.rounds, 0) AS rounds, COALESCE(im.imported, 0) AS imported
       FROM cal LEFT JOIN r ON r.day = cal.day LEFT JOIN im ON im.day = cal.day
       ORDER BY cal.day`, [days]);
    const totalRounds = rows.reduce((t, x) => t + x.rounds, 0);
    const totalImported = rows.reduce((t, x) => t + x.imported, 0);
    res.json({ data: rows, summary: { days, totalRounds, totalImported } });
  }));

  // ---- Admin CSV import (spec §8A): paste/upload → validate → preview → commit.
  // Body: { event_id?, event?: {name,date_start,date_end,venue,region,arena_type},
  //         csv, filename?, source?, dry_run? }
  // One file may span MULTIPLE events: rows carrying event_name + date_start
  // (+date_end) are routed to their own event (auto-created); rows without fall
  // back to the request target. Target required only when some row lacks it.
  // Header vocab (case-insensitive): class_name|class, class_type, class_date,
  // rider_name|rider, horse_name|horse, placing|finish_place, faults|jump_faults,
  // time|time_seconds, time_faults, height_cm, format (Two-phase|Jump-off|Speed|Power & Speed),
  // event_name|event, date_start|event_date, date_end,
  // status (finished|E|R|W|DQ...), notes.
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
  const FORMATS = ['Two-phase', 'Jump-off', 'Speed', 'Power & Speed'];
  const STATUS_MAP = { E: 'eliminated', R: 'retired', W: 'withdrawn', DQ: 'disqualified', ELIM: 'eliminated', RET: 'retired', WD: 'withdrawn', NS: 'withdrawn', FINISHED: 'finished', ELIMINATED: 'eliminated', RETIRED: 'retired', WITHDRAWN: 'withdrawn', DISQUALIFIED: 'disqualified' };

  // Canonical import record (JSON mode uses these exact keys; CSV headers map to them).
  const IMPORT_FIELDS = ['class_name', 'class_type', 'class_date', 'rider_name', 'horse_name',
    'placing', 'faults', 'time', 'time_faults', 'height_cm', 'format', 'status', 'notes', 'series_key',
    'breed', 'age', 'gender', 'sire', 'dam', 'damsire', 'breeder', 'country', 'color', 'year_of_birth',
    'arena_name', 'arena_type', 'surface', 'start_time',
    'round2_faults', 'round2_time', 'jumpoff_faults', 'jumpoff_time', 'prize',
    'region', 'rider_region', 'series_category', 'rider_series', 'nationality', 'rider_nationality',
    'venue', 'venue_country', 'arena_type', 'event_name', 'date_start', 'date_end'];
  // Optional enrichment columns (fill-if-null only — never overwrites curated data).
  const GENDERS = ['Mare', 'Gelding', 'Stallion', 'Filly', 'Colt', 'Mare/Other', 'Unknown'];
  const RIDER_CATS = ['Junior', 'Young Rider', 'Under 25', 'Amateur', 'Pony', 'Tertiary', 'Open'];
  const canon = (v, list) => {
    const t = String(v || '').trim().toLowerCase();
    if (!t) return null;
    return list.find((x) => x.toLowerCase() === t) || null;
  };
  const cleanAge = (v) => {
    const t = String(v ?? '').trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isInteger(n) && n >= 0 && n <= 40 ? n : null;
  };
  const JUNK = new Set(['', 'unknown', 'n/a', 'na', 'n-a', '-', '--', 'unsure', 'nil', 'tbd']);
  const cleanName = (v) => {
    const t = String(v ?? '').trim();
    if (!t || JUNK.has(t.toLowerCase())) return null;
    return t.slice(0, 100);
  };
  const cleanYob = (v) => {
    const t = String(v ?? '').trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isInteger(n) && n >= 1980 && n <= 2100 ? n : null;
  };
  const ARENA_TYPES = ['Indoor', 'Outdoor', 'Covered outdoor arena', 'Unknown'];
  const SURFACES = ['Grass', 'Sand', 'Fibre-sand', 'Synthetic', 'Other', 'Unknown'];
  const canonSurface = (v) => {
    const t = String(v || '').trim().toLowerCase();
    if (!t) return null;
    if (t.startsWith('fibre') || t.startsWith('fiber')) return 'Fibre-sand';
    return canon(v, SURFACES);
  };

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
      format: col('format'), status: col('status'), notes: col('notes'),
      color: col('color', 'colour'), yob: col('year_of_birth', 'born', 'yob'),
      damsire: col('damsire', 'dam_sire', 'dam-sire'),
      arena_name: col('arena_name', 'arena', 'location'),
      arena_type_c: col('class_arena_type'), surface: col('surface'),
      start_time: col('start_time', 'time_started'),
      r2f: col('round2_faults'), r2t: col('round2_time'),
      jof: col('jumpoff_faults'), jot: col('jumpoff_time'), prize: col('prize', 'prize_money'),
      breed: col('breed'), age: col('age'), gender: col('gender'), sire: col('sire'), dam: col('dam'),
      breeder: col('breeder'), country: col('country'),
      region: col('region'), rider_region: col('rider_region'),
      series_category: col('series_category', 'rider_series'), nationality: col('nationality', 'rider_nationality'),
      venue: col('venue'), venue_country: col('venue_country'), arena_type: col('arena_type'),
      event_name: col('event_name', 'event'), date_start: col('date_start', 'event_date'), date_end: col('date_end'),
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
      // multi-event: rows may carry their own event_name + date_start
      const rowsHaveEvents = grid.slice(1).some((r) => String(r[ci.event_name] ?? '').trim());
      if (!evId && !rowsHaveEvents) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'need event_id, event{name,date_start}, or per-row event_name+date_start' });
      }
      const evNames = {}, perEvent = {};
      const bump = (id, name, k) => {
        evNames[id] = name;
        (perEvent[id] ||= { ok: 0, failed: 0, name });
        perEvent[id][k]++;
      };
      const seasonOf = (ds) => {
        const y = Number(String(ds).slice(0, 4)), m = Number(String(ds).slice(5, 7));
        return m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
      };
      const resolveRowEvent = async (rname, ds, de, hint) => {
        if (!rname) {
          if (!evId) return { error: 'no target event; add event_name + date_start to this row' };
          return { id: evId, name: evNames[evId] || 'event' };
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ds || '')) return { error: 'row event needs date_start YYYY-MM-DD' };
        const ex = await client.query('SELECT id, name, is_active FROM events WHERE name = $1 AND date_start = $2', [rname, ds]);
        if (ex.rows.length) {
          if (ex.rows[0].is_active === false) return { error: `event "${rname}" is switched off — enable it in Admin → Events` };
          return { id: ex.rows[0].id, name: ex.rows[0].name };
        }
        const ins = await client.query(
          `INSERT INTO events (name, date_start, date_end, venue, region, arena_type, season, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'MANUAL') RETURNING id, name`,
          [rname, ds, de || ds, (hint && hint.venue) || 'Unknown',
           (hint && hint.region) || null, (hint && hint.arena) || null, seasonOf(ds)]);
        return { id: ins.rows[0].id, name: ins.rows[0].name };
      };
      if (evId) {
        const evRow = (await client.query('SELECT name, season, venue, region, venue_id, is_active FROM events WHERE id = $1', [evId])).rows[0];
        if (!evRow) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'event not found' }); }
        if (evRow.is_active === false) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'event is switched off — enable it in Admin → Events' }); }
        evNames[evId] = evRow.name;
        if (!evRow.venue_id) {
          const vid = await ensureVenue(evRow.venue, evRow.region);
          if (vid) await client.query('UPDATE events SET venue_id = $2 WHERE id = $1', [evId, vid]);
        }
      }

      const out = [];
      let okCount = 0, enriched = 0;
      const evFills = {};
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
        const fmtRaw = g(ci.format);
        if (fmtRaw && !FORMATS.includes(fmtRaw)) errs.push(`format must be ${FORMATS.join('|')}`);
        const fmt = fmtRaw || null;
        const cArenaType = canon(g(ci.arena_type_c), ARENA_TYPES);
        if (g(ci.arena_type_c) && !cArenaType) errs.push(`class arena_type must be ${ARENA_TYPES.join('|')}`);
        const cSurface = canonSurface(g(ci.surface));
        if (g(ci.surface) && !cSurface) errs.push(`surface must be ${SURFACES.join('|')}`);
        const cArenaName = g(ci.arena_name) || null;
        const cStart = g(ci.start_time) || null;
        if (cStart && !/^([01]\d|2[0-3]):[0-5]\d$/.test(cStart)) errs.push('start_time must be HH:MM');
        const r2f = num(g(ci.r2f)), r2t = num(g(ci.r2t)), jof = num(g(ci.jof)), jot = num(g(ci.jot));
        const prize = num(g(ci.prize));
        for (const [v, n] of [[r2f, 'round2_faults'], [r2t, 'round2_time'], [jof, 'jumpoff_faults'], [jot, 'jumpoff_time'], [prize, 'prize']]) {
          if (v !== null && (typeof v !== 'number' || Number.isNaN(v))) errs.push(`${n} must be numeric`);
        }
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
          if (['FINISHED', 'E', 'R', 'W', 'DQ', 'NS', 'ELIM', 'RET', 'WD', 'ELIMINATED', 'RETIRED', 'WITHDRAWN', 'DISQUALIFIED'].includes(stRaw)) {
            status = STATUS_MAP[stRaw] || 'finished';
          } else errs.push('status must be finished|E|R|W|DQ|NS');
        }
        const cdate = g(ci.cdate) || null;
        if (cdate && !/^\d{4}-\d{2}-\d{2}$/.test(cdate)) errs.push('class_date must be YYYY-MM-DD');
        if (errs.length) { out.push({ line: li + 1, ok: false, errors: errs }); continue; }

        // per-row event (multi-event files) or the request target
        const rowEv = await resolveRowEvent(g(ci.event_name), g(ci.date_start), g(ci.date_end), {
          venue: g(ci.venue) || null, region: g(ci.region) || null, arena: g(ci.arena_type) || null,
        });
        if (rowEv.error) { out.push({ line: li + 1, ok: false, errors: [rowEv.error] }); continue; }
        const rEvId = rowEv.id;

        // identity (mirrors ingest/normalize.py)
        const rn = normName(rider), hn = normName(horse);
        // optional enrichment (fill-if-null only — curated values always win)
        const hEn = {
          breed: g(ci.breed) || null, age: cleanAge(g(ci.age)),
          gender: canon(g(ci.gender), GENDERS), sire: cleanName(g(ci.sire)), dam: cleanName(g(ci.dam)),
          damsire: cleanName(g(ci.damsire)), breeder: cleanName(g(ci.breeder)),
          country: g(ci.country) || null, color: g(ci.color) || null,
          year_of_birth: cleanYob(g(ci.yob)),
        };
        const rEn = {
          region: g(ci.rider_region) || null,
          series_category: canon(g(ci.series_category), RIDER_CATS),
          nationality: g(ci.nationality) || null,
        };
        for (const k of ['venue', 'venue_country', 'region', 'arena_type']) {
          const v = g(ci[k]);
          const ef = (evFills[rEvId] ||= {});
          if (v && ef[k] === undefined) ef[k] = v;
        }
        const fillNull = async (table, id, obj) => {
          const sets = Object.entries(obj).filter(([, v]) => v !== null && v !== undefined);
          if (!sets.length) return 0;
          const setSql = sets.map(([k], i) => `${k} = COALESCE(${k}, $${i + 2})`).join(', ');
          const guard = sets.map(([k]) => `${k} IS NULL`).join(' OR ');
          const res = await client.query(
            `UPDATE ${table} SET ${setSql} WHERE id = $1 AND (${guard})`,
            [id, ...sets.map(([, v]) => v)]);
          return res.rowCount;
        };
        let hRow = (await client.query('SELECT id FROM horses WHERE normalized_name = $1', [hn])).rows[0];
        let rRow = (await client.query('SELECT id FROM riders WHERE normalized_name = $1', [rn])).rows[0];
        const newHorse = !hRow, newRider = !rRow;
        if (!hRow) {
          const hk = Object.keys(hEn).filter((k) => hEn[k] !== null);
          hRow = (await client.query(
            `INSERT INTO horses (name, normalized_name${hk.length ? ', ' + hk.join(', ') : ''})
             VALUES ($1,$2${hk.map((_, i) => `,$${i + 3}`).join('')}) RETURNING id`,
            [horse, hn, ...hk.map((k) => hEn[k])])).rows[0];
        } else {
          enriched += await fillNull('horses', hRow.id, hEn);
        }
        if (!rRow) {
          const rk = Object.keys(rEn).filter((k) => rEn[k] !== null);
          rRow = (await client.query(
            `INSERT INTO riders (name, normalized_name${rk.length ? ', ' + rk.join(', ') : ''})
             VALUES ($1,$2${rk.map((_, i) => `,$${i + 3}`).join('')}) RETURNING id`,
            [rider, rn, ...rk.map((k) => rEn[k])])).rows[0];
        } else {
          enriched += await fillNull('riders', rRow.id, rEn);
        }
        const seriesKey = g(ci.series) || null;
        let cRow = (await client.query('SELECT id, series_key, is_active FROM classes WHERE event_id = $1 AND name = $2 AND COALESCE(class_date::TEXT,\'\') = COALESCE($3,\'\')', [rEvId, cls, cdate])).rows[0];
        const newClass = !cRow;
        if (cRow && cRow.is_active === false) {
          out.push({ line: li + 1, ok: false, errors: [`class "${cls}" is switched off — enable it in Admin → Classes`] });
          bump(rEvId, rowEv.name, 'failed');
          continue;
        }
        if (!cRow) {
          cRow = (await client.query(
            'INSERT INTO classes (event_id, name, class_date, height_cm, class_type, format, series_key, arena_name, arena_type, surface, start_time, source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,\'MANUAL\') RETURNING id',
            [rEvId, cls, cdate || null, hcm, ctype, fmt, seriesKey, cArenaName, cArenaType, cSurface, cStart])).rows[0];
        } else {
          if (seriesKey && !cRow.series_key) {
            await client.query('UPDATE classes SET series_key = $2 WHERE id = $1', [cRow.id, seriesKey]);
            cRow.series_key = seriesKey;
          }
          const fills = [];
          if (cArenaName) fills.push(['arena_name', cArenaName]);
          if (cArenaType) fills.push(['arena_type', cArenaType]);
          if (cSurface) fills.push(['surface', cSurface]);
          if (cStart) fills.push(['start_time', cStart]);
          if (fills.length) {
            await client.query(
              `UPDATE classes SET ${fills.map(([k], i) => `${k} = COALESCE(${k}, $${i + 2})`).join(', ')} WHERE id = $1`,
              [cRow.id, ...fills.map(([, v]) => v)]);
          }
        }
        const dup = await client.query(
          'SELECT id FROM round_results WHERE class_id = $1 AND horse_id = $2 AND rider_id = $3',
          [cRow.id, hRow.id, rRow.id]);
        if (dup.rows.length) {
          out.push({ line: li + 1, ok: false, errors: ['duplicate of an existing round'] });
          bump(rEvId, rowEv.name, 'failed');
          continue;
        }
        const tot = (faults ?? 0) + (tf ?? 0);
        const ins = await client.query(
          `INSERT INTO round_results (event_id, class_id, horse_id, rider_id, jump_faults, time_faults,
            total_faults, time_seconds, finish_place, clear_round, height_cm, status, notes, source, points,
            round2_faults, round2_time_seconds, jumpoff_faults, jumpoff_time_seconds, prize_money)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'MANUAL',0,$14,$15,$16,$17,$18) RETURNING id, points`,
          [rEvId, cRow.id, hRow.id, rRow.id, faults ?? 0, tf ?? 0, tot, tsec, place,
           status === 'finished' && tot === 0, hcm, status, g(ci.notes) || null, r2f, r2t, jof, jot, prize]);
        okCount++;
        bump(rEvId, rowEv.name, 'ok');
        out.push({ line: li + 1, ok: true, errors: [], preview: {
          event: rowEv.name, rider, horse, class: cls, place, points: ins.rows[0].points,
          new_horse: newHorse, new_rider: newRider, new_class: newClass,
        }});
      }
      // event-level enrichment from row columns (fill-if-null, first non-empty wins;
      // 'Unknown' venue counts as blank — it is the auto-created placeholder)
      for (const [eid, fill] of Object.entries(evFills)) {
        const evSets = Object.entries(fill);
        if (!evSets.length) continue;
        const setSql = evSets.map(([k], i) => k === 'venue'
          ? `venue = COALESCE(NULLIF(venue, 'Unknown'), $${i + 1})`
          : `${k} = COALESCE(${k}, $${i + 1})`).join(', ');
        const guard = evSets.map(([k]) => k === 'venue'
          ? `(venue IS NULL OR venue = 'Unknown')` : `${k} IS NULL`).join(' OR ');
        const evRes = await client.query(`UPDATE events SET ${setSql} WHERE id = $${evSets.length + 1} AND (${guard})`,
          [...evSets.map(([, v]) => v), eid]);
        enriched += evRes.rowCount;
        const evNow = (await client.query('SELECT venue, venue_id, region FROM events WHERE id = $1', [eid])).rows[0];
        if (evNow && !evNow.venue_id && evNow.venue) {
          const vid = await ensureVenue(evNow.venue, evNow.region);
          if (vid) await client.query('UPDATE events SET venue_id = $2 WHERE id = $1', [eid, vid]);
        }
      }
      const evList = Object.entries(perEvent).map(([id, v]) => ({ id, ...v }));
      const summary = {
        total: grid.length - 1, ok: okCount, failed: out.filter((x) => !x.ok).length,
        enriched, events: evList,
      };
      if (dry_run) {
        await client.query('ROLLBACK');
        return res.json({ data: { dry_run: true, rows: out, summary } });
      }
      for (const ev of evList) {
        await client.query(
          'INSERT INTO import_logs (actor, source, filename, event_id, rows_total, rows_ok, rows_failed) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [(req.authUser && req.authUser.name) || 'admin', src, filename || null, ev.id, ev.ok + ev.failed, ev.ok, ev.failed]);
        audit(req, 'import.commit', 'event', ev.id, { ...summary, filename, event: ev.name });
      }
      await client.query('COMMIT');
      captureSnapshots();
      captureSnapshots();
      bustCache('/events');
      res.status(201).json({ data: { dry_run: false, rows: out, summary } });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* noop */ }
      throw e;
    } finally {
      client.release();
    }
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
      'SELECT id, name, class_date, height_cm, class_type, is_active FROM classes WHERE event_id = $1 ORDER BY class_date, name',
      [req.query.event_id]);
    res.json({ data: rows });
  }));

  // ---- Class visibility admin: per-class switch + per-category kill list ----
  app.get('/admin/classes', needRole('ADMIN'), asyncH(async (req, res) => {
    const { limit } = paging(req, 50, 200);
    const q = String(req.query.q || '').trim();
    const like = `%${q}%`;
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.class_date, c.height_cm, c.class_type, c.is_active,
         e.name AS event_name, e.season,
         (SELECT COUNT(*)::INT FROM round_results rr WHERE rr.class_id = c.id) AS round_count
       FROM classes c JOIN events e ON e.id = c.event_id
       ${q.length >= 2 ? 'WHERE c.name ILIKE $1 OR e.name ILIKE $1' : ''}
       ORDER BY c.class_date DESC NULLS LAST, c.name LIMIT $${q.length >= 2 ? 2 : 1}`,
      q.length >= 2 ? [like, limit] : [limit]
    );
    res.json({ data: rows });
  }));

  const CLASS_FIELDS = ['class_type', 'height_cm', 'is_active'];

  app.get('/admin/visibility', needRole('ADMIN'), asyncH(async (req, res) => {
    const excluded = await excludedClassTypes();
    const { rows: byType } = await pool.query(
      `SELECT c.class_type, COUNT(DISTINCT c.id)::INT AS classes, COUNT(rr.id)::INT AS rounds
       FROM classes c LEFT JOIN round_results rr ON rr.class_id = c.id
       GROUP BY c.class_type ORDER BY 2 DESC`);
    const inactive = (await pool.query(
      'SELECT COUNT(*)::INT AS n FROM classes WHERE is_active IS FALSE')).rows[0].n;
    res.json({ data: { excluded_class_types: excluded, by_type: byType, inactive_classes: inactive } });
  }));

  app.put('/admin/visibility', needRole('ADMIN'), asyncH(async (req, res) => {
    const list = req.body?.excluded_class_types;
    if (!Array.isArray(list) || !list.every((t) => CLASS_TYPES.includes(t))) {
      return res.status(400).json({ error: `excluded_class_types must be an array of ${CLASS_TYPES.join('|')}` });
    }
    await pool.query(
      `INSERT INTO admin_settings (key, value, updated_at) VALUES ('excluded_class_types', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify(list)]
    );
    bustVisibility(); bustPublic();
    audit(req, 'visibility.edit', 'admin_settings', 'excluded_class_types', { excluded: list });
    res.json({ data: { excluded_class_types: list } });
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
        const ev = await pool.query('SELECT id, is_active FROM events WHERE id = $1', [event_id]);
        if (!ev.rows.length) return res.status(404).json({ error: 'event not found' });
        if (ev.rows[0].is_active === false) return res.status(400).json({ error: 'event is switched off — enable it in Admin → Events' });
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
      const ev = (await pool.query(
        'SELECT c.event_id, c.is_active AS class_active, e.is_active FROM classes c JOIN events e ON e.id = c.event_id WHERE c.id = $1',
        [cid])).rows[0];
      if (ev.is_active === false) return res.status(400).json({ error: 'event is switched off — enable it in Admin → Events' });
      if (ev.class_active === false) return res.status(400).json({ error: 'class is switched off — enable it in Admin → Classes' });
      const { rows } = await pool.query(
        `INSERT INTO round_results (event_id, class_id, horse_id, rider_id, jump_faults, time_faults,
          total_faults, time_seconds, finish_place, clear_round, status, notes, source, points)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'MANUAL',0) RETURNING id, points`,
        [ev.event_id, cid, hid, rid, jf ?? 0, tf ?? 0, tot, ts, place,
         st === 'finished' && tot === 0, st, notes || null]);
      audit(req, 'result.create', 'result', rows[0].id, { class_id: cid, place });
      bustCache('/events');
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
  const HORSE_FIELDS = ['name', 'breed', 'gender', 'sire', 'dam', 'damsire', 'breeder', 'year_of_birth', 'color', 'height', 'country', 'image_url', 'visibility'];
  const RIDER_FIELDS = ['name', 'region', 'series_category', 'nationality', 'bio', 'image_url', 'first_name', 'last_name', 'visibility'];
  const EVENT_FIELDS = ['name', 'venue', 'region', 'date_start', 'date_end', 'arena_type', 'event_type', 'status', 'description', 'image_url', 'is_active', 'tier'];

  function patcher(table, fields, label) {
    return asyncH(async (req, res) => {
      const body = req.body || {};
      const sets = [], vals = [];
      for (const f of fields) {
        if (body[f] !== undefined) {
          let v = body[f] === '' ? null : body[f];
          if (f === 'visibility') {
            if (!['public', 'anonymous'].includes(v)) {
              return res.status(400).json({ error: "visibility must be 'public' or 'anonymous'" });
            }
            if (!(await privacy.privacyEnabled(pool))) {
              return res.status(503).json({ error: 'privacy controls not yet enabled (migration 033 pending)' });
            }
          }
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
      if (table === 'riders' || table === 'horses') privacy.bustPrivacyCache();
      if (table === 'events') bustCache('/events');
      if (table === 'classes') { bustVisibility(); bustPublic(); }
      res.json({ data: rows[0] });
    });
  }

  app.patch('/admin/horses/:id', needRole('ADMIN'), patcher('horses', HORSE_FIELDS, 'horse'));
  app.patch('/admin/riders/:id', needRole('ADMIN'), patcher('riders', RIDER_FIELDS, 'rider'));
  app.patch('/admin/events/:id', needRole('ADMIN'), patcher('events', EVENT_FIELDS, 'event'));
  app.patch('/admin/classes/:id', needRole('ADMIN'), patcher('classes', CLASS_FIELDS, 'class'));

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

  app.post('/admin/series/:key/recalc', needRole('ADMIN'), asyncH(async (req, res) => {
    const { rows } = await pool.query(
      `INSERT INTO series_info (series_key, calculated_at) VALUES ($1, NOW())
       ON CONFLICT (series_key) DO UPDATE SET calculated_at = NOW() RETURNING *`, [req.params.key]);
    audit(req, 'series.recalc', 'series', req.params.key, {});
    res.json({ data: rows[0] });
  }));
};
