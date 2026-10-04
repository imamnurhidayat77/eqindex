-- Seasons master — migration 043.
-- Before this, events.season was free text with no relation: typos split
-- groups/filters and season metadata lived hardcoded in frontend code.
--   seasons(key PK, label, date_start, date_end, is_current)
--   events.season -> seasons(key)  (one current season at a time)
-- scoring_versions.season intentionally stays free text (history rows must
-- never block on master data).

CREATE TABLE IF NOT EXISTS seasons (
  key TEXT PRIMARY KEY CHECK (key ~ '^[0-9]{4}-[0-9]{4}$'),
  label TEXT NOT NULL,
  date_start DATE NOT NULL,
  date_end DATE NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;

-- exactly one current season
CREATE UNIQUE INDEX IF NOT EXISTS seasons_one_current
  ON seasons (is_current) WHERE is_current IS TRUE;

-- NZ season runs Aug–Jul
INSERT INTO seasons (key, label, date_start, date_end, is_current)
VALUES ('2026-2027', '2026/27', '2026-08-01', '2027-07-31', TRUE)
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label,
  date_start = EXCLUDED.date_start, date_end = EXCLUDED.date_end,
  is_current = EXCLUDED.is_current;

-- normalize any legacy variants before the FK lands
UPDATE events SET season = '2026-2027'
  WHERE season IS NOT NULL AND season <> '2026-2027' AND season LIKE '2026%2027%';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_season_fkey') THEN
    ALTER TABLE events ADD CONSTRAINT events_season_fkey
      FOREIGN KEY (season) REFERENCES seasons(key) ON UPDATE CASCADE;
  END IF;
END $$;
