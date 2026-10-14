const express = require('express');
const { applySecurity } = require('./middleware/security');
const { mountSession } = require('./middleware/session');
const { mountCache } = require('./middleware/cache');
const { mountPrivacyMask } = require('./middleware/privacy-mask');
const mountPublicRoutes = require('./routes/public');
const mountUserRoutes = require('./routes/user');
const mountAuthRoutes = require('./routes/auth');
const mountAdminRoutes = require('./routes/admin');
const mountScoringRoutes = require('./routes/scoring');
const mountCategoryRoutes = require('./routes/categories');
const mountMediaRoutes = require('./routes/media');

// Mount order mirrors the original index.js registration order.
// No two route files share a path prefix, so relative order across files
// cannot shadow: /events/compare-style static-vs-param pairs live in the
// same file in their original order.
function createApp() {
  const app = express();
  // Stripe webhook needs the raw body — security middleware skips the
  // JSON parser for /api/stripe/webhook (raw parsed in the route itself).
  if (!process.env.STRIPE_SECRET_KEY) console.error('[boot] STRIPE_SECRET_KEY unset — checkout disabled');
  if (!process.env.STRIPE_WEBHOOK_SECRET) console.error('[boot] STRIPE_WEBHOOK_SECRET unset — webhook will 500');
  applySecurity(app);
  mountSession(app);
  mountCache(app);
  mountPrivacyMask(app);
  mountPublicRoutes(app);
  mountUserRoutes(app);
  mountAuthRoutes(app);
  mountAdminRoutes(app);
  mountScoringRoutes(app);
  mountCategoryRoutes(app);
  mountMediaRoutes(app);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[api]', err.message);
    // Deliberate client errors carry .status (message is safe by convention);
    // everything else stays a generic 500 so internals never leak.
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: 'internal error' });
  });
  return app;
}

module.exports = { createApp };
