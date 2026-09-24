-- EQIndex NZ series standings — migration 004
-- Real ESNZ series points (rider/horse/show points). Names kept as scraped text;
-- linking to canonical horses/riders happens in Step 4 (review queue).

CREATE TABLE series_standings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_key TEXT NOT NULL, -- '2135883281-121674'
  series_name TEXT NOT NULL,
  event_name TEXT NOT NULL,
  season TEXT,
  rider_name TEXT NOT NULL,
  horse_name TEXT NOT NULL,
  normalized_rider TEXT NOT NULL,
  normalized_horse TEXT NOT NULL,
  total_points NUMERIC NOT NULL DEFAULT 0,
  points JSONB NOT NULL DEFAULT '{}', -- {"Hawkes Bay A&P 22/10": 30, ...}
  source TEXT NOT NULL DEFAULT 'ESNZ'
    CHECK (source IN ('FEI','EQUIPE','ESNZ','CSV','MANUAL','PORDASI')),
  source_result_id TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, source_result_id)
);
CREATE INDEX series_standings_key_idx ON series_standings (series_key);
CREATE INDEX series_standings_names_idx ON series_standings (normalized_horse, normalized_rider);

-- ============ SERIES RANKINGS ============
CREATE OR REPLACE VIEW series_rankings AS
SELECT
  series_key, series_name, event_name, season, rider_name, horse_name, total_points,
  (SELECT COUNT(*) FROM jsonb_each_text(points) WHERE NULLIF(value, '') IS NOT NULL) AS shows_counted,
  RANK() OVER (PARTITION BY series_key ORDER BY total_points DESC) AS rank
FROM series_standings;

-- ============ HEIGHT PROGRESSION (per horse per height) ============
CREATE OR REPLACE VIEW horse_height_stats AS
SELECT
  h.id AS horse_id, h.name AS horse, rr.height_cm,
  COUNT(*) AS starts,
  SUM(rr.clear_round::INT) AS clears,
  ROUND(100.0 * AVG(rr.clear_round::INT), 1) AS clear_pct,
  ROUND(AVG(rr.total_faults), 2) AS avg_faults
FROM horses h
JOIN round_results rr ON rr.horse_id = h.id
WHERE rr.height_cm IS NOT NULL
GROUP BY h.id, h.name, rr.height_cm;

-- ============ RECENT FORM (last 5 starts per horse) ============
CREATE OR REPLACE VIEW horse_recent_form AS
SELECT horse, class_date, class, total_faults, clear_round FROM (
  SELECT h.name AS horse, c.class_date, c.name AS class,
         rr.total_faults, rr.clear_round,
         ROW_NUMBER() OVER (PARTITION BY h.id ORDER BY c.class_date DESC NULLS LAST, rr.created_at DESC) AS rn
  FROM horses h
  JOIN round_results rr ON rr.horse_id = h.id
  JOIN classes c ON c.id = rr.class_id
) t WHERE rn <= 5;
