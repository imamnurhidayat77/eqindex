const pool = require('../db');
const privacy = require('../privacy');

// ---- Privacy opt-out (migration 033): mask opted-out names for non-admins.
// Admins and /auth/* (own session data) bypass. Fail-open: pre-migration or
// on DB error the body passes through unchanged (never break reads).
function mountPrivacyMask(app) {
  app.use((req, res, next) => {
    const orig = res.json.bind(res);
    res.json = (body) => {
      if (req.authUser && req.authUser.role === 'ADMIN') return orig(body);
      if (req.path.startsWith('/auth/')) return orig(body);
      return privacy.maskResponse(pool, body).then(orig).catch(() => orig(body));
    };
    next();
  });
}

module.exports = { mountPrivacyMask };
