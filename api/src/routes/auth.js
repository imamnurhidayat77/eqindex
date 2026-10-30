const pool = require('../db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { SESSION_COOKIE, APP_URL } = require('../config');
const { getCookie, clearSessionCookie } = require('../lib/cookies');
const { asyncH } = require('../lib/async');
const { newSession, EMAIL_RE } = require('../lib/auth');
const { throttled } = require('../lib/ratelimit');
const { audit } = require('../lib/audit');
const { sendMail } = require('../lib/mailer');
const totp = require('../lib/totp');

// Reset tokens live 1 hour (enforced in SQL), single-use, sha256 at rest.
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const escHtml = (v) => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

module.exports = function mountAuthRoutes(app) {
  // ---- Auth: register / login / logout / me ----
  app.post('/auth/register', asyncH(async (req, res) => {
    if (req.authUser) return res.status(409).json({ error: 'already logged in — log out first' });
    if (await throttled(pool, req.ip || 'x')) return res.status(429).json({ error: 'too many attempts, try later' });
    const { name, email, password, role } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!name || !String(name).trim() || !EMAIL_RE.test(cleanEmail)) {
      return res.status(400).json({ error: 'need {name, valid email}' });
    }
    if (!password || String(password).length < 8 || String(password).length > 72) {
      return res.status(400).json({ error: 'password must be 8-72 chars' });
    }
    const wantRole = ['PUBLIC', 'RIDER', 'COACH'].includes(role) ? role : 'PUBLIC';
    const exists = await pool.query('SELECT id, name, password_hash FROM users WHERE email = $1', [cleanEmail]);
    if (exists.rows.length) {
      const d = exists.rows[0];
      if (d.password_hash) return res.status(409).json({ error: 'email already registered' });
      // Password-less row (guest checkout): don't 409 — convert to a claim.
      // Same single-use 1-hour token as forgot-password; inbox owner wins.
      if (!APP_URL) {
        return res.status(503).json({ error: 'email not configured yet — contact support' });
      }
      await pool.query(`DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL`, [d.id]);
      const raw = crypto.randomBytes(32).toString('hex');
      await pool.query(
        `INSERT INTO password_resets (user_id, token_hash, expires_at)
          VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
        [d.id, sha256(raw)]
      );
      const link = `${APP_URL}/reset?token=${raw}`;
      try {
        await sendMail({
          to: cleanEmail,
          subject: 'Claim your Boss Media account',
          text: `Hi ${d.name || 'there'},\n\nThis email was used for a guest purchase. Set a password to claim the account and reach your downloads anytime:\n${link}\n\nThis link expires in 1 hour. Didn't buy anything? Ignore this email.`,
          html: `<p>Hi ${escHtml(d.name) || 'there'},</p><p>This email was used for a guest purchase. <a href="${link}">Set a password to claim your account</a> and reach your downloads anytime.</p><p>This link expires in 1 hour. Didn't buy anything? Ignore this email.</p>`,
        });
      } catch (e) {
        await pool.query(`DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL`, [d.id]);
        throw e;
      }
      audit(req, 'auth.register.claim', 'user', d.id, {});
      return res.json({ data: { claim_sent: true } });
    }
    const hash = await bcrypt.hash(String(password), 12);
    const { rows } = await pool.query(
      'INSERT INTO users (name, email, role, password_hash) VALUES ($1,$2,$3,$4) RETURNING id, name, email, role',
      [String(name).trim().slice(0, 100), cleanEmail, wantRole, hash]);
    await newSession(res, req, rows[0].id);
    res.status(201).json({ data: rows[0] });
  }));

  app.post('/auth/login', asyncH(async (req, res) => {
    if (req.authUser) return res.status(409).json({ error: 'already logged in — log out first' });
    if (await throttled(pool, req.ip || 'x')) return res.status(429).json({ error: 'too many attempts, try later' });
    const { email, password } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [cleanEmail]);
    const u = rows[0];
    const ok = u && u.password_hash && await bcrypt.compare(String(password || ''), u.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid email or password' });
    if (u.totp_secret && u.totp_verified_at) {
      // Password OK, code pending: hand out a 5-minute single-use challenge,
      // never a session — the session is minted only after the TOTP verifies.
      const raw = crypto.randomBytes(32).toString('hex');
      await pool.query(
        `INSERT INTO mfa_challenges (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '5 minutes')`,
        [u.id, sha256(raw)]
      );
      return res.json({ data: { mfa_required: true, challenge: raw } });
    }
    await newSession(res, req, u.id);
    res.json({ data: { id: u.id, name: u.name, email: u.email, role: u.role } });
  }));

  // ---- TOTP MFA for money/power roles (ADMIN, PHOTOGRAPHER, ORGANIZER) ----
  const MFA_ROLES = ['ADMIN', 'PHOTOGRAPHER', 'ORGANIZER'];
  const mfaAllowed = (req, res) => {
    if (!req.authUser) { res.status(401).json({ error: 'login required' }); return false; }
    if (!MFA_ROLES.includes(req.authUser.role)) {
      res.status(403).json({ error: 'MFA is available for admin, photographer and organizer accounts' }); return false;
    }
    return true;
  };

  // Step 1: mint a secret (user scans it into their authenticator app,
  // then proves possession via /auth/mfa/verify).
  app.post('/auth/mfa/setup', asyncH(async (req, res) => {
    if (!mfaAllowed(req, res)) return;
    const secret = totp.generateSecret();
    await pool.query(
      'UPDATE users SET totp_secret = $1, totp_verified_at = NULL WHERE id = $2',
      [secret, req.authUser.id]
    );
    audit(req, 'auth.mfa.setup', 'user', req.authUser.id, {});
    res.json({ data: {
      secret,
      otpauth_url: totp.otpauthUrl({ issuer: 'Boss Media', account: req.authUser.email, secret }),
    } });
  }));

  app.get('/auth/mfa/status', asyncH(async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: 'login required' });
    const { rows } = await pool.query(
      'SELECT totp_verified_at IS NOT NULL AS enabled FROM users WHERE id = $1', [req.authUser.id]);
    res.json({ data: { enabled: !!rows[0]?.enabled, eligible: MFA_ROLES.includes(req.authUser.role) } });
  }));

  // Step 2: prove possession — enforcement starts on next login.
  app.post('/auth/mfa/verify', asyncH(async (req, res) => {
    if (!mfaAllowed(req, res)) return;
    if (await throttled(pool, req.ip || 'x', 'mfa')) return res.status(429).json({ error: 'too many attempts, try later' });
    const { token } = req.body || {};
    const { rows } = await pool.query('SELECT totp_secret FROM users WHERE id = $1', [req.authUser.id]);
    if (!rows[0]?.totp_secret || !totp.verify(token, rows[0].totp_secret)) {
      return res.status(400).json({ error: 'wrong code — check your authenticator app time' });
    }
    await pool.query('UPDATE users SET totp_verified_at = NOW() WHERE id = $1', [req.authUser.id]);
    audit(req, 'auth.mfa.verify', 'user', req.authUser.id, {});
    res.json({ ok: true });
  }));

  // Disable requires the current password (so a hijacked session alone
  // cannot strip MFA).
  app.post('/auth/mfa/disable', asyncH(async (req, res) => {
    if (!mfaAllowed(req, res)) return;
    const { password } = req.body || {};
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.authUser.id]);
    if (!rows[0]?.password_hash || !(await bcrypt.compare(String(password || ''), rows[0].password_hash))) {
      return res.status(401).json({ error: 'password incorrect' });
    }
    await pool.query('UPDATE users SET totp_secret = NULL, totp_verified_at = NULL WHERE id = $1', [req.authUser.id]);
    audit(req, 'auth.mfa.disable', 'user', req.authUser.id, {});
    res.json({ ok: true });
  }));

  // Step 3 (login flow): trade a live challenge + TOTP code for a session.
  app.post('/auth/mfa/challenge', asyncH(async (req, res) => {
    if (req.authUser) return res.status(409).json({ error: 'already logged in — log out first' });
    if (await throttled(pool, req.ip || 'x', 'mfa')) return res.status(429).json({ error: 'too many attempts, try later' });
    const { challenge, token } = req.body || {};
    if (!challenge || typeof challenge !== 'string') return res.status(400).json({ error: 'need a valid challenge' });
    const { rows } = await pool.query(
      `SELECT c.id, c.user_id, c.attempts, u.totp_secret, u.totp_verified_at, u.name, u.email, u.role
         FROM mfa_challenges c JOIN users u ON u.id = c.user_id
        WHERE c.token_hash = $1 AND c.used_at IS NULL AND c.expires_at > NOW()`,
      [sha256(challenge)]
    );
    const row = rows[0];
    if (!row) return res.status(400).json({ error: 'challenge expired — sign in again' });
    if (row.attempts >= 5 || !row.totp_secret || !row.totp_verified_at || !totp.verify(token, row.totp_secret)) {
      await pool.query('UPDATE mfa_challenges SET attempts = attempts + 1 WHERE id = $1', [row.id]);
      return res.status(400).json({ error: 'wrong code — check your authenticator app time' });
    }
    await pool.query('UPDATE mfa_challenges SET used_at = NOW() WHERE id = $1', [row.id]);
    await pool.query('DELETE FROM mfa_challenges WHERE user_id = $1 AND id <> $2', [row.user_id, row.id]);
    await newSession(res, req, row.user_id);
    audit(req, 'auth.mfa.challenge', 'user', row.user_id, {});
    res.json({ data: { id: row.user_id, name: row.name, email: row.email, role: row.role } });
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
    if (await throttled(pool, req.ip || 'x')) return res.status(429).json({ error: 'too many attempts, try later' });
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
          html: `<p>Hi ${escHtml(u.name) || 'there'},</p><p><a href="${link}">Reset your password</a> (expires in 1 hour).</p><p>Didn't ask for this? Ignore this email — your password stays as is.</p>`,
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
    if (await throttled(pool, req.ip || 'x')) return res.status(429).json({ error: 'too many attempts, try later' });
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
