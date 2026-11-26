-- Merch art proofs with several files (front, back, left, right, detail…).
-- One row per file of a proof_sent event; the file lives in R2 at
-- merch/proofs/<order_id>/<event_id>/<position>.<jpg|pdf>. Proofs sent
-- before this table have no rows and keep their single file at
-- merch/proofs/<order_id>/<event_id>.<jpg|pdf>.
CREATE TABLE IF NOT EXISTS merch_proof_files (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES merch_order_events(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 7),
  label TEXT NOT NULL DEFAULT '' CHECK (char_length(label) <= 30),
  kind TEXT NOT NULL CHECK (kind IN ('image', 'pdf')),
  width INT NULL,
  height INT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, position)
);
