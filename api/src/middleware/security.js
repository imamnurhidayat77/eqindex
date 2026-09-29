const express = require('express');
const cors = require('cors');
const { WEB_ORIGINS } = require('../config');

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
  app.use(express.json({ limit: '10mb' }));
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
}

module.exports = { applySecurity };
