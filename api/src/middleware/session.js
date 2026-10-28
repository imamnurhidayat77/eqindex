const crypto = require('crypto');
const pool = require('../db');
const { SESSION_COOKIE } = require('../config');
const { getCookie } = require('../lib/cookies');

// Idle timeouts: money/power roles get a short fuse, everyone else a week.
// Absolute cap stays 30 days (expires_at). last_seen slides at most every
// 5 minutes so normal traffic costs ~1 write, not 1 per request.
// ---- Session auth (best practice: opaque token, sha256 at rest, httpOnly cookie) ----
const IDLE_MS = { ADMIN: 12 * 3600e3, PHOTOGRAPHER: 12 * 3600e3, ORGANIZER: 12 * 3600e3 };
const DEFAULT_IDLE_MS = 7 * 24 * 3600e3;
async function sessionUser(req) {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, s.last_seen_at FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`, [hash]);
  const row = rows[0];
  if (!row) return null;
  const idleFor = Date.now() - new Date(row.last_seen_at).getTime();
  if (idleFor > (IDLE_MS[row.role] || DEFAULT_IDLE_MS)) {
    await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hash]).catch(() => {});
    return null;
  }
  if (idleFor > 5 * 60e3) {
    pool.query('UPDATE sessions SET last_seen_at = NOW() WHERE token_hash = $1', [hash]).catch(() => {});
  }
  const { last_seen_at: _drop, ...user } = row;
  return user;
}

// attach once, before all routes
function mountSession(app) {
  app.use(async (req, _res, next) => {
    try { req.authUser = await sessionUser(req); } catch { req.authUser = null; }
    next();
  });
}

module.exports = { sessionUser, mountSession };
