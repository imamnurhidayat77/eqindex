-- EQIndex stable-lite + curation — migration 005
-- Review queue: ambiguous horse/rider names awaiting human decision
-- (approve as new | merge into canonical via alias | reject).

CREATE TABLE review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('horse','rider')),
  raw_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  suggested_match_id UUID,
  suggested_match_name TEXT,
  source TEXT NOT NULL DEFAULT 'CSV'
    CHECK (source IN ('FEI','EQUIPE','ESNZ','CSV','MANUAL','PORDASI')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','merged','rejected')),
  resolved_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX review_status_idx ON review_queue (status);

-- Demo candidates (typo + punctuation variants of real demo records)
INSERT INTO review_queue (kind, raw_name, normalized_name, suggested_match_name, source) VALUES
  ('horse', 'Kiwi-Spirit', 'KIWISPIRIT', 'Kiwi Spirit', 'CSV'),
  ('rider', 'Sophie Bennet', 'SOPHIE BENNET', 'Sophie Bennett', 'CSV'),
  ('horse', 'Southern  Cross', 'SOUTHERN CROSS', 'Southern Cross', 'CSV');
