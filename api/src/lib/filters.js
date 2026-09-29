const pool = require('../db');
const { bustCache } = require('../middleware/cache');

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

// ---- Class visibility (migration 032): per-class switch (classes.is_active)
// plus per-category kill list (admin_settings 'excluded_class_types').
// Excluded classes stay in the DB but vanish from every aggregate.
// The kill list is cached 60s — admin toggles apply within a minute on hot paths.
let visCache = { t: 0, excluded: [] };
async function excludedClassTypes() {
  if (Date.now() - visCache.t < 60 * 1000) return visCache.excluded;
  try {
    const { rows } = await pool.query(
      "SELECT value FROM admin_settings WHERE key = 'excluded_class_types'");
    const v = JSON.parse(rows[0]?.value || '[]');
    visCache = { t: Date.now(), excluded: Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [] };
  } catch { /* keep last good (fail-open) */ }
  return visCache.excluded;
}
function bustVisibility() { visCache.t = 0; }
// SQL fragment for class visibility on a `classes c` join — interpolate only
// (never a param: call sites have fixed numbering). Values come from the
// validated admin kill list; single-quotes escaped defensively.
async function visSql() {
  const excl = await excludedClassTypes();
  const list = excl.map((t) => `'${String(t).replace(/'/g, "''")}'`).join(',');
  return `c.is_active IS NOT FALSE${list ? ` AND NOT (c.class_type = ANY (ARRAY[${list}]))` : ''}`;
}
// Same slice filters as roundFilters() plus class visibility. All call sites
// join round_results rr + classes c, so the predicate can reference c directly.
async function roundFiltersVis(q) {
  const f = roundFilters(q);
  const conds = f.clause ? [f.clause.replace(/^WHERE /, '')] : [];
  const params = [...f.params];
  conds.push('c.is_active IS NOT FALSE');
  const excluded = await excludedClassTypes();
  if (excluded.length) {
    params.push(excluded);
    conds.push(`NOT (c.class_type = ANY ($${params.length}))`);
  }
  return { clause: 'WHERE ' + conds.join(' AND '), params };
}
function bustPublic() {
  for (const p of ['/rankings', '/classes', '/trends/', '/stats/', '/arenas', '/venues', '/series', '/events/', '/horses/', '/riders/', '/comparison']) bustCache(p);
}
module.exports = { roundFilters, roundFiltersVis, visSql, excludedClassTypes, bustVisibility };
