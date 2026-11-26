require('dotenv').config();

// Central environment config — every tunable lives here so route and
// middleware modules never read process.env directly.
module.exports = {
  PORT: process.env.PORT || 3001,
  SESSION_COOKIE: 'eq_session',
  SESSION_DAYS: 30,
  WEB_ORIGINS: (process.env.WEB_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean),
  EMAIL_RE: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  MAIL_FROM: process.env.MAIL_FROM || 'Boss Media <hello@bossmedia.nz>',
  // resend | smtp | console (DEV_MAIL_SKIP=1 forces console). SMTP covers
  // every major provider (Gmail app password, SendGrid, Brevo, Mailtrap).
  MAIL_PROVIDER: process.env.MAIL_PROVIDER || 'resend',
  SMTP: {
    host: process.env.SMTP_HOST || '',
    port: Math.max(1, parseInt(process.env.SMTP_PORT || '587', 10) || 587),
    secure: process.env.SMTP_SECURE === '1', // true for port 465, false for 587 (STARTTLS)
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
  APP_URL: (process.env.APP_URL || '').replace(/\/$/, ''),
  // Community moments intake: single inbox, email-to-upload (migration 100).
  UPLOAD_EMAIL: (process.env.UPLOAD_EMAIL || '').toLowerCase(),
  UPLOAD_MAX_FILES: Math.max(1, parseInt(process.env.UPLOAD_MAX_FILES || '5', 10) || 5),
  UPLOAD_MAX_BYTES: Math.max(1024, parseInt(process.env.UPLOAD_MAX_BYTES || '20971520', 10) || 20971520),
  INBOUND_WEBHOOK_SECRET: process.env.INBOUND_WEBHOOK_SECRET || '',
  // Web app cache flush after imports/merges (web/app/api/revalidate).
  // Both unset = no-op, the web cache then expires on its own revalidate timer.
  WEB_REVALIDATE_URL: process.env.WEB_REVALIDATE_URL || '',
  REVALIDATE_SECRET: process.env.REVALIDATE_SECRET || '',
  // Dev-only escape hatch: when email has no API key, log auth links to the
  // server console and let the flow succeed instead of 503ing. NEVER set in
  // production — the emailed link IS the ownership proof for guest claims.
  DEV_MAIL_SKIP: process.env.DEV_MAIL_SKIP === '1',
};

// Production boot guard: these are load-bearing (session cookies, claim
// links, webhook verification). Crash loudly instead of serving half-secure.
function prodConfigProblems(env = process.env) {
  if (env.NODE_ENV !== 'production') return [];
  const out = [];
  for (const k of ['WEB_ORIGIN', 'APP_URL', 'STRIPE_WEBHOOK_SECRET']) {
    if (!String(env[k] || '').trim()) out.push(`${k} is required in production`);
  }
  if (String(env.DEV_MAIL_SKIP || '') === '1') out.push('DEV_MAIL_SKIP must never be 1 in production');
  if (String(env.MAIL_PROVIDER || 'resend').toLowerCase() === 'console') {
    out.push('MAIL_PROVIDER=console must never be used in production (mail would only be logged)');
  }
  // Inbound intake only matters when an inbox is configured — then the
  // webhook secret is load-bearing (without it the route stays 503 anyway,
  // but fail loudly instead of silently dropping event mail).
  if (String(env.UPLOAD_EMAIL || '').trim() && !String(env.INBOUND_WEBHOOK_SECRET || '').trim()) {
    out.push('INBOUND_WEBHOOK_SECRET is required when UPLOAD_EMAIL is set');
  }
  return out;
}

module.exports.prodConfigProblems = prodConfigProblems;
