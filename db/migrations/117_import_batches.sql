-- Undo per import. Every committed import run is one batch (the browser
-- reuses one id across its 50-row chunks and a Resume; the server makes
-- one per request when none is sent). Each inserted round result is
-- stamped with its batch, and the batch records:
--   created: ids of horses/riders/classes/events/venues the import created
--   fills:   fill-if-null changes it made to rows that already existed
--            [{table, id, column, old, new}]
-- so POST /admin/imports/:id/undo can remove exactly what the import added
-- (created rows only when nothing else references them; fills only while
-- the value is still the one the import wrote).
-- Imports committed before this migration carry no batch: not undoable.
-- Safe to re-run (IF NOT EXISTS). Rollback: db/rollback/117_import_batches.sql

CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY,
  actor_id UUID,
  actor_name TEXT,
  source TEXT NOT NULL DEFAULT 'CSV',
  filename TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'undone')),
  rows_ok INT NOT NULL DEFAULT 0,
  rows_failed INT NOT NULL DEFAULT 0,
  chunks INT NOT NULL DEFAULT 0,
  series_ack BOOLEAN NOT NULL DEFAULT FALSE,
  names_ack BOOLEAN NOT NULL DEFAULT FALSE,
  created JSONB NOT NULL DEFAULT '{}'::JSONB,
  fills JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  undone_at TIMESTAMPTZ,
  undone_by UUID,
  undo_summary JSONB
);
CREATE INDEX IF NOT EXISTS import_batches_time_idx ON import_batches (created_at DESC);
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;

ALTER TABLE round_results ADD COLUMN IF NOT EXISTS import_batch_id UUID
  REFERENCES import_batches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS round_results_import_batch_idx
  ON round_results (import_batch_id) WHERE import_batch_id IS NOT NULL;
