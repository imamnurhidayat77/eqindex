const crypto = require('crypto');
const pool = require('../db');
const { SESSION_COOKIE } = require('../config');
const { getCookie } = require('../lib/cookies');

// ---- Session auth (best practice: opaque token, sha256 at rest, httpOnly cookie) ----
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
function mountSession(app) {
  app.use(async (req, _res, next) => {
    try { req.authUser = await sessionUser(req); } catch { req.authUser = null; }
    next();
  });
}

module.exports = { sessionUser, mountSession };
