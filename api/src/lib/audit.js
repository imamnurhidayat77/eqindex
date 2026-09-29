const pool = require('../db');

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
module.exports = { audit };
