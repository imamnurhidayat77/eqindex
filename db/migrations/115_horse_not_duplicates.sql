-- Pairs of horses an admin has checked and marked "not a duplicate"
-- (similar names, different horses, e.g. Venus vs Venus MVNZ). The admin
-- duplicate finder hides a group once every pair in it is marked.
-- Stored with a_id < b_id so each pair has one row. Removing the row
-- restores the suggestion. Safe to re-run.

CREATE TABLE IF NOT EXISTS horse_not_duplicates (
  a_id UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  b_id UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  marked_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (a_id, b_id),
  CHECK (a_id < b_id)
);
ALTER TABLE horse_not_duplicates ENABLE ROW LEVEL SECURITY;
