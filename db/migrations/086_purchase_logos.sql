-- 086: sponsor logos baked into a buyer's download (Option 1).
-- A purchase may carry up to 3 logos at fixed corners; the composited
-- file is cached as a stored variant so both versions are kept.

CREATE TABLE IF NOT EXISTS purchase_sponsor_logos (
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  sponsor_logo_id UUID NOT NULL REFERENCES sponsor_logos(id),
  position TEXT NOT NULL DEFAULT 'bottom-left'
    CHECK (position IN ('bottom-left', 'bottom-right', 'top-right')),
  PRIMARY KEY (purchase_id, sponsor_logo_id)
);

ALTER TABLE purchases ADD COLUMN IF NOT EXISTS logo_variant_key TEXT NULL;
