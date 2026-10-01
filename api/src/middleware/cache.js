// ---- Public GET cache (60s, anonymous only): repeat page loads skip Postgres.
// Never caches admin/auth/user-scoped routes; logged-in traffic always bypasses.
const CACHE_TTL = 60 * 1000;
const cacheStore = new Map();
const CACHEABLE = [/^\/rankings\//, /^\/classes$/, /^\/trends\//, /^\/stats\//, /^\/arenas$/, /^\/events(\/|$)/, /^\/venues/, /^\/series/, /^\/peers/, /^\/news\//, /^\/(horses|riders)\/[^/]+$/];

function mountCache(app) {
  app.use((req, res, next) => {
    if (req.method !== 'GET' || !CACHEABLE.some((rx) => rx.test(req.path))) return next();
    if ((req.headers.cookie || '').includes('eq_session')) return next();
    const key = req.originalUrl;
    const hit = cacheStore.get(key);
    if (hit && Date.now() - hit.t < CACHE_TTL) {
      res.set('X-Cache', 'HIT');
      return res.json(hit.body);
    }
    const orig = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200) {
        cacheStore.set(key, { t: Date.now(), body });
        if (cacheStore.size > 500) cacheStore.delete(cacheStore.keys().next().value);
      }
      res.set('X-Cache', 'MISS');
      return orig(body);
    };
    next();
  });
}

function bustCache(prefix) {
  for (const k of [...cacheStore.keys()]) {
    if (k === prefix || k.startsWith(prefix + '?') || k.startsWith(prefix + '/')) cacheStore.delete(k);
  }
}

function bustPublic() {
  for (const p of ['/rankings', '/classes', '/trends/', '/stats/', '/arenas', '/venues/', '/series', '/events/', '/horses/', '/riders/', '/comparison', '/news']) bustCache(p);
}

module.exports = { mountCache, bustCache, bustPublic };
