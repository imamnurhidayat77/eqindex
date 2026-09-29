require('dotenv').config();

// Central environment config — every tunable lives here so route and
// middleware modules never read process.env directly.
module.exports = {
  PORT: process.env.PORT || 3001,
  SESSION_COOKIE: 'eq_session',
  SESSION_DAYS: 30,
  WEB_ORIGINS: (process.env.WEB_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean),
  EMAIL_RE: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
};
