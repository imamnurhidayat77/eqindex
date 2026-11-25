const pool = require('../db');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A merged-away horse (migration 113) keeps working at its old id/slug:
// follow horse_merges to the horse that was kept (up to 5 hops).
const MERGED_SQL = `
  WITH RECURSIVE c(id, n) AS (
    SELECT $1::uuid, 0
    UNION ALL
    SELECT m.into_id, c.n + 1 FROM c
    JOIN horse_merges m ON m.from_id = c.id AND m.undone_at IS NULL
    WHERE c.n < 5)
  SELECT c.id FROM c JOIN horses h ON h.id = c.id ORDER BY c.n LIMIT 1`;

async function followMerge(id) {
  try {
    const { rows } = await pool.query(MERGED_SQL, [id]);
    return rows[0]?.id || null;
  } catch (e) {
    if (e.code === '42P01') return null; // migration 113 not applied yet
    throw e;
  }
}

async function mergedSlug(slug) {
  try {
    const { rows } = await pool.query(
      `SELECT from_id FROM horse_merges WHERE from_slug = $1 AND undone_at IS NULL
       ORDER BY created_at DESC LIMIT 1`, [slug]);
    return rows[0] ? followMerge(rows[0].from_id) : null;
  } catch (e) {
    if (e.code === '42P01') return null;
    throw e;
  }
}

// Dual-route: UUIDs keep working; slugs resolve to ids (briefing FR-05).
async function resolveId(table, param, res) {
  const p = String(param);
  if (UUID_RE.test(p)) {
    if (table !== 'horses') return p;
    return (await followMerge(p)) || p;
  }
  const slug = p.toLowerCase();
  const { rows } = await pool.query(`SELECT id FROM ${table} WHERE slug = $1`, [slug]);
  if (rows.length) return rows[0].id;
  if (table === 'horses') {
    const id = await mergedSlug(slug);
    if (id) return id;
  }
  res.status(404).json({ error: 'not found' });
  return null;
}
module.exports = { UUID_RE, resolveId };
