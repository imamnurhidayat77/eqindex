const pool = require('../db');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Dual-route: UUIDs keep working; slugs resolve to ids (briefing FR-05).
async function resolveId(table, param, res) {
  if (UUID_RE.test(String(param))) return param;
  const { rows } = await pool.query(`SELECT id FROM ${table} WHERE slug = $1`, [String(param).toLowerCase()]);
  if (!rows.length) { res.status(404).json({ error: 'not found' }); return null; }
  return rows[0].id;
}
module.exports = { UUID_RE, resolveId };
