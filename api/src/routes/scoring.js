const pool = require('../db');
const { asyncH } = require('../lib/async');
const { audit } = require('../lib/audit');
const { needRole } = require('../lib/auth');
const { divisionFor, classPoints, bestTen, matchCategory } = require('../scoring/calc');
const { DEFAULTS } = require('../scoring/defaults');

// Active rules, cached 60s (same pattern as class-visibility kill list).
// Consumers: weekend categories, class division display, preview.
let rulesCache = { t: 0, rules: null };
async function activeRules() {
  if (Date.now() - rulesCache.t < 60 * 1000 && rulesCache.rules !== undefined) return rulesCache.rules;
  let rules = null;
  try {
    const { rows } = await pool.query(
      `SELECT params FROM scoring_versions WHERE status = 'active' ORDER BY season DESC LIMIT 1`);
    rules = rows[0]?.params || null;
  } catch { /* pre-migration: no dynamic rules */ }
  rulesCache = { t: Date.now(), rules };
  return rules;
}
// Full active version (params + provenance) for methodology displays.
async function activeVersion() {
  try {
    const { rows } = await pool.query(
      `SELECT season, version, label, activated_at, params FROM scoring_versions WHERE status = 'active' ORDER BY season DESC LIMIT 1`);
    return rows[0] || null;
  } catch { return null; }
}
function bustRulesCache() { rulesCache.t = 0; }

function validateParams(p) {
  if (!p || typeof p !== 'object') return 'params must be an object';
  if ((p.mode || 'eqindex') === 'esnz') return validateEsnz(p);
  const divs = p.divisions;
  if (!Array.isArray(divs) || !divs.length) return 'divisions must be a non-empty array';
  for (const d of divs) {
    if (!d.key || !d.label) return 'each division needs key + label';
    if (d.min != null && d.max != null && !(Number(d.min) < Number(d.max))) {
      return `division ${d.key}: min must be below max`;
    }
  }
  const pts = p.points || {};
  if (!Array.isArray(pts.placing) || pts.placing.length !== 5 || !pts.placing.every(Number.isFinite)) {
    return 'points.placing must be 5 numbers';
  }
  for (const k of ['clear', 'doubleBonus', 'classMax']) {
    if (!Number.isFinite(Number(pts[k]))) return `points.${k} must be a number`;
  }
  if (!p.bestTen || !(Number(p.bestTen.n) > 0)) return 'bestTen.n must be > 0';
  // categories are optional here — managed from the dedicated Categories menu.
  if (p.categories !== undefined && !Array.isArray(p.categories)) return 'categories must be an array';
  return null;
}

// Validation for mode='esnz' (Annex 11): every number editable, no hardcode.
// Divisions live at top level (shared display bands, any mode).
function validateEsnz(p, ez) {
  ez = ez || p.esnz;
  if (p.divisions !== undefined) {
    if (!Array.isArray(p.divisions) || !p.divisions.length) return 'divisions must be a non-empty array';
    for (const d of p.divisions) {
      if (!d.key || !d.label) return 'each division needs key + label';
      if (d.min != null && d.max != null && !(Number(d.min) < Number(d.max))) {
        return `division ${d.key}: min must be below max`;
      }
    }
  }
  if (!ez || typeof ez !== 'object') return 'esnz must be an object';
  if (!['series_only', 'all_classes'].includes(ez.scope)) return "esnz.scope must be 'series_only' or 'all_classes'";
  for (const k of ['grand_prix', 'premier']) {
    const t = ez.scales?.[k];
    if (!Array.isArray(t) || !t.length || !t.every(Number.isFinite)) return `esnz.scales.${k} must be a non-empty number array`;
  }
  const n = Number(ez.placesCounted);
  if (!(n > 0) || !Number.isInteger(n)) return 'esnz.placesCounted must be a positive integer';
  for (const k of ['grand_prix', 'premier']) {
    if ((ez.scales[k] || []).length !== n) return `esnz.scales.${k} length must equal placesCounted (${n})`;
  }
  if (ez.zeroFaultThreshold !== null && ez.zeroFaultThreshold !== undefined
    && !(Number(ez.zeroFaultThreshold) > 0)) return 'esnz.zeroFaultThreshold must be > 0 or null';
  const yh = ez.youngHorse || {};
  for (const k of ['firstClear', 'doubleClearTotal']) {
    if (!Number.isFinite(Number(yh[k]))) return `esnz.youngHorse.${k} must be a number`;
  }
  if (yh.seriesKeys !== undefined && !Array.isArray(yh.seriesKeys)) return 'esnz.youngHorse.seriesKeys must be an array';
  const series = ez.series || {};
  if (typeof series !== 'object') return 'esnz.series must be an object';
  for (const [key, cfg] of Object.entries(series)) {
    if (!cfg || typeof cfg !== 'object') return `esnz.series.${key} must be an object`;
    const hasBest = Number(cfg.bestOf) > 0;
    const hasSliding = Array.isArray(cfg.sliding);
    const seasonTotal = cfg.seasonTotal === true;
    if (!hasBest && !hasSliding && !seasonTotal) return `esnz.series.${key} needs bestOf, sliding or seasonTotal`;
    if (hasSliding && !cfg.sliding.every((r) => Array.isArray(r) && r.length === 2 && r.every(Number.isFinite))) {
      return `esnz.series.${key}.sliding must be [[held,count],...]`;
    }
    if (cfg.scale !== undefined && !['show_rating', 'grand_prix', 'premier', 'none'].includes(cfg.scale)) {
      return `esnz.series.${key}.scale invalid`;
    }
    for (const list of ['scaleOverride', 'multipliers']) {
      if (cfg[list] !== undefined && (!Array.isArray(cfg[list]) || !cfg[list].every((r) =>
        Array.isArray(r.eventKinds) && (list === 'multipliers' ? Number(r.mult) > 0 : typeof r.scale === 'string')
        && (r.classNameContains === undefined || (Array.isArray(r.classNameContains) && r.classNameContains.every((s) => typeof s === 'string')))))) {
        return `esnz.series.${key}.${list} invalid`;
      }
    }
    if (cfg.sources !== undefined && !Array.isArray(cfg.sources)) return `esnz.series.${key}.sources must be an array`;
  }
  return null;
}
// Rounds-to-count for a series config given rounds-held (bestOf or
// Premier-League-style sliding table). Shared by preview + series detail.
function seriesCountFor(cfg, held) {
  if (Array.isArray(cfg.sliding)) {
    const desc = [...cfg.sliding].sort((a, b) => b[0] - a[0]);
    for (const [h, c] of desc) { if (held >= h) return c; }
    return Math.min(held, desc.length ? desc[desc.length - 1][1] : 0);
  }
  if (Number(cfg.bestOf) > 0) return Number(cfg.bestOf);
  return null;
}
// Preview for mode='esnz': runs the REAL esnz_recalc_class_with() inside a
// rolled-back transaction, so preview numbers are identical to activation
// by construction (no JS mirror to drift). Returns per-round stats +
// per-series best-N top-10 under the draft params.
async function previewEsnz(rules, season) {
  const ez = rules.esnz || {};
  const seriesCfg = ez.series || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT esnz_recalc_class_with(c.id, $2, -1, e.tier, e.event_kind)
       FROM classes c JOIN events e ON e.id = c.event_id WHERE e.season = $1`,
      [season, rules]);
    const { rows } = await client.query(
      `SELECT c.series_key, r.name AS rider, h.name AS horse, e.name AS event,
          e.event_kind, SUM(rr.points)::INT AS pts, COUNT(*)::INT AS rounds
       FROM round_results rr
       JOIN classes c ON c.id = rr.class_id
       JOIN events e ON e.id = rr.event_id
       JOIN riders r ON r.id = rr.rider_id
       JOIN horses h ON h.id = rr.horse_id
       WHERE e.season = $1 AND rr.points_version = -1
       GROUP BY c.series_key, r.name, h.name, e.name, e.event_kind`,
      [season]);
    const rescored = rows.reduce((s, r) => s + Number(r.rounds), 0);
    const scored = rows.filter((r) => Number(r.pts) > 0);
    await client.query('ROLLBACK');
    // aggregate per series-key: best event totals per combo, then best-N
    const bySeries = {};
    for (const r of scored) {
      if (!r.series_key) continue;
      const k = `${r.rider}||${r.horse}`;
      ((bySeries[r.series_key] ||= {})[k] ||= { rider: r.rider, horse: r.horse, events: {} });
      const combo = bySeries[r.series_key][k];
      combo.events[r.event] = (combo.events[r.event] || 0) + Number(r.pts);
    }
    const tables = {};
    for (const [key, combos] of Object.entries(bySeries)) {
      const cfg = seriesCfg[key] || {};
      const held = Object.keys(combos).length
        ? new Set(Object.values(combos).flatMap((c) => Object.keys(c.events))).size : 0;
      const n = seriesCountFor(cfg, held);
      tables[key] = {
        held, counted: n,
        top: Object.values(combos).map((c) => {
          const scores = Object.values(c.events).sort((a, b) => b - a);
          const kept = n ? scores.slice(0, n) : scores;
          return { ...c, total: kept.reduce((s, v) => s + v, 0), dropped: scores.length - kept.length };
        }).sort((a, b) => b.total - a.total).slice(0, 10),
      };
    }
    return { mode: 'esnz', scope: ez.scope || 'series_only', rounds: rescored, scoringRounds: scored.length, tables };
  } finally {
    try { await client.query('ROLLBACK'); } catch { /* already rolled back */ }
    client.release();
  }
}
// Preview: best-ten per division under the given rules for one season.
async function previewSeason(rules, season) {
  if ((rules.mode || 'eqindex') === 'esnz') return previewEsnz(rules, season);
  const P = rules.points || {};
  const N = Number(rules.bestTen?.n) || 10;
  const minField = Number(rules.bestTen?.minField ?? 3);
  const { rows } = await pool.query(
    `SELECT rr.horse_id, h.name AS horse, c.height_cm AS class_h,
       COALESCE(rr.height_cm, c.height_cm) AS h, c.is_world_cup,
       rr.clear_round, rr.finish_place, rr.round2_faults, rr.jumpoff_faults,
       c.field_size, COUNT(*) OVER (PARTITION BY c.id)::INT AS observed
     FROM round_results rr
     JOIN classes c ON c.id = rr.class_id
     JOIN horses h ON h.id = rr.horse_id
     JOIN events e ON e.id = rr.event_id
     WHERE e.season = $1 AND c.is_active IS NOT FALSE`,
    [season]);
  let missingField = 0, smallField = 0;
  const byDivHorse = {};
  for (const r of rows) {
    const div = divisionFor(r.h, r.is_world_cup, rules);
    if (!div) continue;
    // field_size 0 means "unknown" (never backfilled), not "empty class" —
    // fall back to the observed round count in that case.
    const raw = r.field_size;
    const field = (raw === null || raw === undefined || Number(raw) <= 0) ? r.observed : raw;
    if (field === null || field === undefined) { missingField += 1; continue; }
    if (Number(field) < minField) { smallField += 1; continue; }
    const doubleClear = !!r.clear_round
      && ((r.jumpoff_faults !== null && Number(r.jumpoff_faults) === 0)
        || (r.round2_faults !== null && Number(r.round2_faults) === 0));
    const pts = classPoints({ clear: !!r.clear_round, doubleClear, place: Number(r.finish_place) }, P);
    ((byDivHorse[div] ||= {})[r.horse_id] ||= { horse: r.horse, scores: [] }).scores.push(pts);
  }
  const tables = {};
  for (const [div, horses] of Object.entries(byDivHorse)) {
    tables[div] = Object.entries(horses)
      .map(([horse_id, v]) => ({ horse_id, horse: v.horse, ...bestTen(v.scores, N) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }
  return { tables, rounds: rows.length, excludedMissingField: missingField, excludedSmallField: smallField, minField };
}

module.exports = function mountScoringRoutes(app) {
  // Public: active rules (methodology pages read this, never hardcode).
  app.get('/scoring/active', asyncH(async (req, res) => {
    const v = await activeVersion();
    if (!v) return res.status(404).json({ error: 'no active scoring version' });
    res.json({ data: { season: v.season, version: v.version, label: v.label, activated_at: v.activated_at, params: v.params } });
  }));

  // Public: built-in v0.3 defaults in force when nothing is active.
  // Admin → Scoring displays these so the live numbers are never a mystery.
  app.get('/scoring/defaults', asyncH(async (req, res) => {
    res.json({ data: DEFAULTS });
  }));

  app.get('/admin/scoring/versions', needRole('ADMIN'), asyncH(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, season, version, status, label, created_at, activated_at FROM scoring_versions ORDER BY season DESC, version DESC`);
    res.json({ data: rows });
  }));

  app.get('/admin/scoring/versions/:id', needRole('ADMIN'), asyncH(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM scoring_versions WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'version not found' });
    res.json({ data: rows[0] });
  }));

  app.post('/admin/scoring/versions', needRole('ADMIN'), asyncH(async (req, res) => {
    const { season, label, cloneFrom } = req.body || {};
    if (!season) return res.status(400).json({ error: 'need {season}' });
    let params = req.body.params || null;
    if (cloneFrom) {
      const src = await pool.query('SELECT params FROM scoring_versions WHERE id = $1', [cloneFrom]);
      if (!src.rows.length) return res.status(404).json({ error: 'source version not found' });
      params = src.rows[0].params;
    }
    if (!params) return res.status(400).json({ error: 'need {params} or {cloneFrom}' });
    const err = validateParams(params);
    if (err) return res.status(400).json({ error: err });
    const max = await pool.query('SELECT COALESCE(MAX(version), 0) + 1 AS v FROM scoring_versions WHERE season = $1', [season]);
    const { rows } = await pool.query(
      `INSERT INTO scoring_versions (season, version, status, label, params, created_by)
       VALUES ($1, $2, 'draft', $3, $4, $5) RETURNING *`,
      [season, max.rows[0].v, String(label || '').slice(0, 120), params, req.authUser.id]);
    audit(req, 'scoring.create', 'scoring', rows[0].id, { season, version: rows[0].version });
    res.status(201).json({ data: rows[0] });
  }));

  app.put('/admin/scoring/versions/:id', needRole('ADMIN'), asyncH(async (req, res) => {
    const cur = await pool.query('SELECT status FROM scoring_versions WHERE id = $1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'version not found' });
    if (cur.rows[0].status !== 'draft') {
      return res.status(409).json({ error: 'only drafts are editable — clone to make changes' });
    }
    const { params, label } = req.body || {};
    if (params !== undefined) {
      const err = validateParams(params);
      if (err) return res.status(400).json({ error: err });
    }
    const { rows } = await pool.query(
      `UPDATE scoring_versions SET params = COALESCE($2, params), label = COALESCE($3, label)
       WHERE id = $1 RETURNING *`,
      [req.params.id, params || null, label !== undefined ? String(label).slice(0, 120) : null]);
    audit(req, 'scoring.edit', 'scoring', req.params.id, {});
    res.json({ data: rows[0] });
  }));

  app.post('/admin/scoring/versions/:id/preview', needRole('ADMIN'), asyncH(async (req, res) => {
    const cur = await pool.query('SELECT season, params FROM scoring_versions WHERE id = $1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'version not found' });
    const out = await previewSeason(cur.rows[0].params, cur.rows[0].season);
    res.json({ data: out });
  }));

  app.delete('/admin/scoring/versions/:id', needRole('ADMIN'), asyncH(async (req, res) => {
    const cur = await pool.query('SELECT status FROM scoring_versions WHERE id = $1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'version not found' });
    if (cur.rows[0].status !== 'draft') {
      return res.status(409).json({ error: 'only drafts can be deleted — active/archived versions are history' });
    }
    await pool.query('DELETE FROM scoring_versions WHERE id = $1', [req.params.id]);
    audit(req, 'scoring.delete', 'scoring', req.params.id, {});
    res.json({ ok: true });
  }));

  app.post('/admin/scoring/versions/:id/activate', needRole('ADMIN'), asyncH(async (req, res) => {
    const cur = await pool.query('SELECT season, status, version, params FROM scoring_versions WHERE id = $1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'version not found' });
    const { season, version, params } = cur.rows[0];
    await pool.query('BEGIN');
    try {
      await pool.query(`UPDATE scoring_versions SET status = 'archived' WHERE season = $1 AND status = 'active'`, [season]);
      await pool.query(`UPDATE scoring_versions SET status = 'active', activated_at = NOW() WHERE id = $1`, [req.params.id]);
      // Cutover: every round of this season is rescored under the new params
      // and stamped, so published tables never mix formulas silently.
      const recomputed = await recomputeSeason(pool, season, params, version);
      await pool.query('COMMIT');
      bustRulesCache();
      audit(req, 'scoring.activate', 'scoring', req.params.id, { season, version, recomputed });
      res.json({ ok: true, recomputed });
    } catch (e) {
      await pool.query('ROLLBACK');
      throw e;
    }
  }));

  // Manual re-run of the cutover for one season (idempotent).
  app.post('/admin/scoring/recompute', needRole('ADMIN'), asyncH(async (req, res) => {
    const season = String(req.body?.season || '').trim();
    if (!season) return res.status(400).json({ error: 'need {season}' });
    const cur = await pool.query(
      `SELECT version, params FROM scoring_versions WHERE season = $1 AND status = 'active'`, [season]);
    if (!cur.rows.length) return res.status(409).json({ error: `no active version for ${season} — activate one first` });
    const recomputed = await recomputeSeason(pool, season, cur.rows[0].params, cur.rows[0].version);
    audit(req, 'scoring.recompute', 'scoring', season, { version: cur.rows[0].version, recomputed });
    res.json({ ok: true, version: cur.rows[0].version, recomputed });
  }));
};

// Recompute every round of one season under the given version params.
// mode='esnz': calls the SAME esnz_recalc_class() the triggers use —
// single source of truth, zero drift. Setting points via that function
// never refires the share trigger (depth guard in 041).
async function recomputeSeason(pool, season, params, version) {
  if ((params.mode || 'eqindex') === 'esnz') {
    const r = await pool.query(
      `SELECT esnz_recalc_class(c.id) FROM classes c
       JOIN events e ON e.id = c.event_id WHERE e.season = $1`, [season]);
    const c2 = await pool.query(
      `SELECT COUNT(*)::INT AS n, COALESCE(SUM(rr.points), 0)::INT AS pts
       FROM round_results rr JOIN events e ON e.id = rr.event_id
       WHERE e.season = $1 AND rr.points_version = $2`, [season, version]);
    return { season, mode: 'esnz', classes: r.rowCount, rounds: c2.rows[0].n, totalPoints: c2.rows[0].pts };
  }
  const P = params.points || {};
  const placing = Array.isArray(P.placing) && P.placing.length === 5 ? P.placing : [5, 4, 3, 2, 1];
  const clear = Number.isFinite(Number(P.clear)) ? Number(P.clear) : 10;
  const dbl = Number.isFinite(Number(P.doubleBonus)) ? Number(P.doubleBonus) : 5;
  const cap = Number.isFinite(Number(P.classMax)) ? Number(P.classMax) : 20;
  const r = await pool.query(
    `UPDATE round_results rr SET
       points = CASE WHEN rr.status <> 'finished' OR rr.finish_place IS NULL THEN 0 ELSE LEAST(
         (CASE WHEN rr.clear_round THEN $2 ELSE 0 END) +
         (CASE WHEN rr.clear_round
           AND ((rr.jumpoff_faults IS NOT NULL AND rr.jumpoff_faults = 0)
             OR (rr.round2_faults IS NOT NULL AND rr.round2_faults = 0)) THEN $3 ELSE 0 END) +
         (CASE WHEN rr.finish_place BETWEEN 1 AND 5 THEN ($4::int[])[rr.finish_place] ELSE 0 END),
         $5) END,
       points_version = $6
     FROM classes c JOIN events e ON e.id = c.event_id
     WHERE rr.class_id = c.id AND e.season = $1`,
    [season, clear, dbl, placing, cap, version]
  );
  return { season, rounds: r.rowCount };
}

module.exports.activeRules = activeRules;
module.exports.bustRulesCache = bustRulesCache;
module.exports.seriesCountFor = seriesCountFor;
module.exports.validateParams = validateParams;
