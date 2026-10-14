-- 057: series verify workflow (anti-Sophia) + series height specs.
-- Idempotent: safe to re-run.
-- series_verdicts: exact-name verdicts so the import gate stops asking.
--   verdict 'non_series' = human judged genuinely non-series.
--   (series judgments live on classes.series_key itself.)
CREATE TABLE IF NOT EXISTS series_verdicts (
  class_name TEXT PRIMARY KEY,
  verdict TEXT NOT NULL CHECK (verdict = 'non_series'),
  decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- series_height_specs: official per-series standard heights, applied when a
-- class name defers to them ("as per series conditions") instead of stating
-- a height. Seeded empty — values need human confirmation first.
CREATE TABLE IF NOT EXISTS series_height_specs (
  series_key TEXT PRIMARY KEY,
  default_height_cm INT NOT NULL CHECK (default_height_cm BETWEEN 50 AND 200),
  source TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
