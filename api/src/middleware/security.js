const express = require('express');
const cors = require('cors');
const { SESSION_COOKIE } = require('../config');
const { WEB_ORIGINS } = require('../config');

function allowedOrigins() {
  const fromEnv = String(process.env.WEB_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const appUrl = String(process.env.APP_URL || '').replace(/\/$/, '');
  const out = [];
  for (const u of [...WEB_ORIGINS, appUrl, ...fromEnv]) {
    try { out.push(new URL(u).origin); } catch { /* ignore junk */ }
  }
  return [...new Set(out)];
}

// CSRF guard for cookie-authenticated mutations. Session cookies are
// SameSite=None in production (cross-site Vercel -> Cloud Run), so the
// browser alone won't stop a malicious site from firing authenticated
// POSTs. Like Rails/Django: unsafe methods carrying a session cookie must
// name a whitelisted Origin (else Referer), otherwise 403.
function csrfGuard(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const hasCookie = String(req.headers.cookie || '').split(';')
    .some((p) => p.slice(0, p.indexOf('=')).trim() === SESSION_COOKIE);
  if (!hasCookie) return next();
  const raw = req.headers.origin || req.headers.referer || '';
  let origin = '';
  try { origin = raw && new URL(raw).origin; } catch { origin = ''; }
  const allowed = allowedOrigins();
  if (allowed.length && allowed.includes(origin)) return next();
  if (process.env.NODE_ENV !== 'production') {
    // Local dev: unconfigured allowlist, or localhost frontends.
    if (!allowed.length) return next();
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return next();
  }
  if (!origin) {
    // No Origin/Referer: only non-browser clients (curl, tests, scripts).
    // Browsers always send one — except multipart form posts, which are
    // CORS-simple and need no preflight, so require it there.
    const ct = String(req.headers['content-type'] || '');
    if (!ct.startsWith('multipart/')) return next();
  }
  return res.status(403).json({ error: 'cross-site request refused' });
}

// Baseline hardening: no server fingerprint, no framing/sniffing, and a
// CORS policy that never reflects arbitrary origins with credentials.
// Browsers use the same-origin /api proxy, so direct cross-origin access is
// never needed. Local dev stays permissive; production denies unless
// WEB_ORIGIN is set.
function applySecurity(app) {
  app.disable('x-powered-by');
  app.use(cors({
    origin: WEB_ORIGINS.length ? WEB_ORIGINS : (process.env.NODE_ENV === 'production' ? false : true),
    credentials: true,
  }));
  // Stripe webhooks verify the RAW body signature, so skip the JSON parser
  // for that path (the webhook route parses raw itself). Trailing slash
  // tolerated — Stripe dashboard entries and proxies vary.
  app.use((req, res, next) => {
    if (req.path.replace(/\/$/, '') === '/api/stripe/webhook') return next();
    return express.json({ limit: '10mb' })(req, res, next);
  });
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // JSON API: nothing may frame or script against it.
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
    }
    next();
  });
  app.use(csrfGuard);
}

module.exports = { applySecurity };
