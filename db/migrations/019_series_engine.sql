-- Series engine (client spec v2 §5): best-of rules, auto-calc flag, timestamps.
ALTER TABLE series_info ADD COLUMN IF NOT EXISTS best_of INT CHECK (best_of IS NULL OR best_of > 0);
ALTER TABLE series_info ADD COLUMN IF NOT EXISTS auto_calc BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE series_info ADD COLUMN IF NOT EXISTS calculated_at TIMESTAMPTZ;
