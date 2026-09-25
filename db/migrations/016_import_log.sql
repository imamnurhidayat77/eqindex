-- EQIndex admin CSV import log — migration 016.
CREATE TABLE IF NOT EXISTS import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor TEXT NOT NULL DEFAULT 'admin',
  source TEXT NOT NULL DEFAULT 'CSV',
  filename TEXT,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  rows_total INT NOT NULL DEFAULT 0,
  rows_ok INT NOT NULL DEFAULT 0,
  rows_failed INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS import_logs_time_idx ON import_logs (created_at DESC);
