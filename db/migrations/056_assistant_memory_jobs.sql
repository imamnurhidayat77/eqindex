-- 056: Import Assistant memory + background jobs (phases 2-3).
-- Idempotent: safe to re-run.
-- assistant_memory: per-admin lasting preferences. kinds:
--   'series_map' — key = lowercase class-name fragment, value = {series_key}
--   'note'       — key = short label, value = {text}
-- assistant_jobs: background mapping jobs polled by the web client
-- (Vercel proxy kills requests past ~30s; AI mapping of big PDFs is slower).
CREATE TABLE IF NOT EXISTS assistant_memory (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, kind, key)
);

CREATE TABLE IF NOT EXISTS assistant_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  input JSONB NOT NULL DEFAULT '{}',
  output JSONB,
  error TEXT,
  progress JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS assistant_jobs_user_status
  ON assistant_jobs (user_id, status, created_at DESC);
