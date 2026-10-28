// Postgres-backed fixed-window rate limiter, shared across instances.
// Same call shape as the old in-memory throttled() it replaces:
//   if (await throttled(pool, req.ip || 'x', 'checkout')) return 429...
// Default 10 hits / 10 min per (bucket, key). Expired rows are swept
// opportunistically (~1% of calls) so no cron is needed.
async function throttled(pool, key, bucket = 'default', limit = 10, windowMs = 10 * 60e3) {
  const k = String(key || 'x').slice(0, 120);
  const b = String(bucket || 'default').slice(0, 60);
  const reset = new Date(Date.now() + windowMs);
  const { rows } = await pool.query(
    `INSERT INTO rate_limits (bucket, key, count, reset_at)
      VALUES ($1, $2, 1, $3)
      ON CONFLICT (bucket, key) DO UPDATE SET
        count = CASE WHEN rate_limits.reset_at <= NOW() THEN 1 ELSE rate_limits.count + 1 END,
        reset_at = CASE WHEN rate_limits.reset_at <= NOW() THEN $3 ELSE rate_limits.reset_at END
      RETURNING count`,
    [b, k, reset]
  ).catch((e) => {
    // Fail-open (never 500 legit traffic) but loud: missing table means
    // migration 080 hasn't been applied.
    if (!throttled._warned) { throttled._warned = true; console.error('[ratelimit] store unavailable:', e.message); }
    return { rows: [] };
  });
  if (Math.random() < 0.01) {
    pool.query(`DELETE FROM rate_limits WHERE reset_at < NOW() - INTERVAL '1 hour'`).catch(() => {});
  }
  if (!rows.length) return false; // fail-open if the table is missing
  return Number(rows[0].count) > limit;
}

module.exports = { throttled };
