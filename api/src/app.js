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

// Mount order mirrors the original index.js registration order.
// No two route files share a path prefix, so relative order across files
// cannot shadow: /events/compare-style static-vs-param pairs live in the
// same file in their original order.
function createApp() {
  const app = express();
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
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[api]', err.message);
    res.status(500).json({ error: 'internal error' });
  });
  return app;
}

module.exports = { createApp };
