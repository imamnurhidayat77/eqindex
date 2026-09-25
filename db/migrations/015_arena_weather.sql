-- EQIndex Phase Arena & Weather (client spec v2 §12).
-- Arena recorded per class (type + surface split); weather cached per
-- venue+date with measured/reported/calculated NEVER conflated. Additive only.

-- ============ 1. Arena per class ============
ALTER TABLE classes ADD COLUMN IF NOT EXISTS arena_type TEXT
  CHECK (arena_type IS NULL OR arena_type IN ('Indoor','Outdoor','Covered outdoor arena','Unknown'));
ALTER TABLE classes ADD COLUMN IF NOT EXISTS surface TEXT
  CHECK (surface IS NULL OR surface IN ('Grass','Sand','Fibre-sand','Synthetic','Other','Unknown'));
ALTER TABLE classes ADD COLUMN IF NOT EXISTS arena_dimensions TEXT;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS warmup_surface TEXT;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS surface_condition TEXT;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS slope TEXT
  CHECK (slope IS NULL OR slope IN ('Flat','Sloping','Unknown'));
ALTER TABLE classes ADD COLUMN IF NOT EXISTS day_night TEXT
  CHECK (day_night IS NULL OR day_night IN ('Day','Night','Unknown'));
ALTER TABLE classes ADD COLUMN IF NOT EXISTS lighting TEXT
  CHECK (lighting IS NULL OR lighting IN ('Natural','Artificial','Mixed','Unknown'));

-- ============ 2. Weather cache (measured service data) ============
CREATE TABLE IF NOT EXISTS weather_cache (
  venue_norm TEXT NOT NULL,
  date DATE NOT NULL,
  temp_c NUMERIC,
  rainfall_mm NUMERIC,
  wind_kph NUMERIC,
  wind_dir_deg INT,
  humidity_pct INT,
  classification TEXT, -- dry|wet|windy|hot|cold (+ combos), EQIndex interpretation
  source TEXT NOT NULL DEFAULT 'open-meteo',
  lat NUMERIC, lon NUMERIC,
  is_estimate BOOLEAN NOT NULL DEFAULT TRUE,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (venue_norm, date)
);

-- ============ 3. Expose arena in class_stats (appended last) ============
CREATE OR REPLACE VIEW class_stats AS
SELECT
  c.id AS class_id,
  e.name AS event,
  c.name AS class,
  c.height_cm,
  c.field_size AS starters,
  SUM(rr.clear_round::INT) AS clears,
  ROUND(100.0 * AVG(rr.clear_round::INT), 1) AS clear_pct,
  ROUND(AVG(rr.total_faults), 2) AS avg_faults,
  e.season,
  c.class_type,
  c.class_number,
  c.format,
  c.sponsor,
  c.series_key,
  c.result_status,
  c.arena_type,
  c.surface
FROM classes c
JOIN events e ON e.id = c.event_id
LEFT JOIN round_results rr ON rr.class_id = c.id
GROUP BY c.id, e.name, c.name, c.height_cm, c.field_size, e.season,
         c.class_type, c.class_number, c.format, c.sponsor, c.series_key,
         c.result_status, c.arena_type, c.surface;
