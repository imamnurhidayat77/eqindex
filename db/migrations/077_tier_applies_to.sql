-- 077: license tiers can target photos, reels, or both.
-- Existing tiers stay shared ('both') so current shop prices don't move.

ALTER TABLE license_tiers
  ADD COLUMN IF NOT EXISTS applies_to TEXT NOT NULL DEFAULT 'both'
  CHECK (applies_to IN ('photo', 'reel', 'both'));
