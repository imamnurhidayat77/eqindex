const crypto = require('crypto');
const pool = require('../db');
const { setSessionCookie } = require('./cookies');

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
// Rate limiting lives in lib/ratelimit.js (Postgres-backed, per-bucket).
// The old in-memory throttled() was removed: it reset per process and
// ignored its bucket argument.

async function ownOrAdmin(req, res, table, label) {
  if (!req.authUser) { res.status(401).json({ error: 'login required' }); return null; }
  const { rows } = await pool.query(`SELECT created_by FROM ${table} WHERE id = $1`, [req.params.id]);
  if (!rows.length) { res.status(404).json({ error: 'not found' }); return null; }
  const owner = rows[0].created_by;
  if (req.authUser.role !== 'ADMIN' && (!owner || owner !== req.authUser.id)) {
    res.status(403).json({ error: `only the creator or an admin can delete this ${label}` });
    return null;
  }
  return true;
}


// ---- Elite MVP: user scope is the SESSION user only. Never trust
// ?user_id= / X-User-Id / body user_id (IDOR: any caller could read or
// rewrite another user's watchlist, comparisons and alert prefs).
function needUser(req, res) {
  if (!req.authUser) { res.status(401).json({ error: 'login required' }); return null; }
  return req.authUser.id;
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
module.exports = { EMAIL_RE, newSession, needRole, needUser, ownOrAdmin };
