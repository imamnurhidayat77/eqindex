const pool = require('../db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { SESSION_COOKIE, APP_URL } = require('../config');
const { getCookie, clearSessionCookie } = require('../lib/cookies');
const { asyncH } = require('../lib/async');
const { newSession, throttled, EMAIL_RE } = require('../lib/auth');
const { audit } = require('../lib/audit');
const { sendMail } = require('../lib/mailer');

// Reset tokens live 1 hour (enforced in SQL), single-use, sha256 at rest.
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

module.exports = function mountAuthRoutes(app) {
  // ---- Auth: register / login / logout / me ----
  app.post('/auth/register', asyncH(async (req, res) => {
    if (req.authUser) return res.status(409).json({ error: 'already logged in — log out first' });
    if (throttled(req.ip || 'x')) return res.status(429).json({ error: 'too many attempts, try later' });
    const { name, email, password, role } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!name || !String(name).trim() || !EMAIL_RE.test(cleanEmail)) {
      return res.status(400).json({ error: 'need {name, valid email}' });
    }
    if (!password || String(password).length < 8 || String(password).length > 72) {
      return res.status(400).json({ error: 'password must be 8-72 chars' });
    }
    const wantRole = ['PUBLIC', 'RIDER', 'COACH'].includes(role) ? role : 'PUBLIC';
    const exists = await pool.query('SELECT 1 FROM users WHERE email = $1', [cleanEmail]);
    if (exists.rows.length) return res.status(409).json({ error: 'email already registered' });
    const hash = await bcrypt.hash(String(password), 12);
    const { rows } = await pool.query(
      'INSERT INTO users (name, email, role, password_hash) VALUES ($1,$2,$3,$4) RETURNING id, name, email, role',
      [String(name).trim().slice(0, 100), cleanEmail, wantRole, hash]);
    await newSession(res, req, rows[0].id);
    res.status(201).json({ data: rows[0] });
  }));

  app.post('/auth/login', asyncH(async (req, res) => {
    if (req.authUser) return res.status(409).json({ error: 'already logged in — log out first' });
    if (throttled(req.ip || 'x')) return res.status(429).json({ error: 'too many attempts, try later' });
    const { email, password } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [cleanEmail]);
    const u = rows[0];
    const ok = u && u.password_hash && await bcrypt.compare(String(password || ''), u.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid email or password' });
    await newSession(res, req, u.id);
    res.json({ data: { id: u.id, name: u.name, email: u.email, role: u.role } });
  }));

  app.post('/auth/logout', asyncH(async (req, res) => {
    const token = getCookie(req, SESSION_COOKIE);
    if (token) {
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hash]);
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  }));

  app.get('/auth/me', asyncH(async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: 'not logged in' });
    res.json({ data: req.authUser });
  }));

  app.post('/auth/password', asyncH(async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: 'login required' });
    const { current, next } = req.body || {};
    if (!next || String(next).length < 8 || String(next).length > 72) {
      return res.status(400).json({ error: 'new password must be 8-72 chars' });
    }
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.authUser.id]);
    const u = rows[0];
    if (!u || !u.password_hash || !(await bcrypt.compare(String(current || ''), u.password_hash))) {
      return res.status(401).json({ error: 'current password incorrect' });
    }
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2',
      [await bcrypt.hash(String(next), 12), req.authUser.id]);
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [req.authUser.id]);
    clearSessionCookie(req, res);
    audit(req, 'auth.password_change', 'user', req.authUser.id, {});
    res.json({ ok: true, relogin: true });
  }));

  // ---- Password reset via email (Resend). Responses are identical whether
  // the address exists or not, so accounts can't be enumerated.
  app.post('/auth/forgot', asyncH(async (req, res) => {
    if (throttled(req.ip || 'x')) return res.status(429).json({ error: 'too many attempts, try later' });
    const cleanEmail = String(req.body?.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) return res.status(400).json({ error: 'need a valid email' });
    if (!APP_URL) {
      console.error('[forgot] APP_URL unset — cannot build reset link');
      return res.status(503).json({ error: 'email not configured yet — contact support' });
    }
    const { rows } = await pool.query('SELECT id, name FROM users WHERE email = $1', [cleanEmail]);
    const u = rows[0];
    if (u) {
      // One live token per user: older unused tokens die with the new one.
      await pool.query(`DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL`, [u.id]);
      const raw = crypto.randomBytes(32).toString('hex');
      await pool.query(
        `INSERT INTO password_resets (user_id, token_hash, expires_at)
          VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
        [u.id, sha256(raw)]
      );
      const link = `${APP_URL}/reset?token=${raw}`;
      try {
        await sendMail({
          to: cleanEmail,
          subject: 'Reset your Boss Media password',
          text: `Hi ${u.name || 'there'},\n\nReset your password here (expires in 1 hour):\n${link}\n\nDidn't ask for this? Ignore this email — your password stays as is.`,
          html: `<p>Hi ${u.name || 'there'},</p><p><a href="${link}">Reset your password</a> (expires in 1 hour).</p><p>Didn't ask for this? Ignore this email — your password stays as is.</p>`,
        });
      } catch (e) {
        // Don't leave a live token the user can never receive.
        await pool.query(`DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL`, [u.id]);
        throw e;
      }
      audit(req, 'auth.forgot', 'user', u.id, {});
    }
    res.json({ ok: true });
  }));

  app.post('/auth/reset', asyncH(async (req, res) => {
    if (throttled(req.ip || 'x')) return res.status(429).json({ error: 'too many attempts, try later' });
    const { token, password } = req.body || {};
    if (!token || typeof token !== 'string' || token.length > 256) {
      return res.status(400).json({ error: 'need a valid reset token' });
    }
    if (!password || String(password).length < 8 || String(password).length > 72) {
      return res.status(400).json({ error: 'password must be 8-72 chars' });
    }
    const { rows } = await pool.query(
      `SELECT id, user_id FROM password_resets
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [sha256(token)]
    );
    const row = rows[0];
    if (!row) return res.status(400).json({ error: 'this link is invalid or expired — request a new one' });
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2',
      [await bcrypt.hash(String(password), 12), row.user_id]);
    await pool.query(`UPDATE password_resets SET used_at = NOW() WHERE id = $1`, [row.id]);
    // Force relogin everywhere, including attacker's sessions if any.
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [row.user_id]);
    audit(req, 'auth.reset', 'user', row.user_id, {});
    res.json({ ok: true });
  }));
};
