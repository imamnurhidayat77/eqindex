-- 080: persistent rate-limit counters shared across API instances
-- (the old in-memory Map reset per process and shared one bucket).

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT NOT NULL,
  key TEXT NOT NULL,
  count INT NOT NULL DEFAULT 1,
  reset_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (bucket, key)
);

CREATE INDEX IF NOT EXISTS rate_limits_expiry ON rate_limits (reset_at);
