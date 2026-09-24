-- EQIndex points engine — migration 008 (Designer Briefing §5)
-- Placing-based points (12/9/7/6/5/4/3/2/1/1 for 1st–10th × class multiplier),
-- 12M/3M windows, podiums, Elim/WD status, slugs, series categories, admin tables.
-- ADDITIVE ONLY: existing views/tables untouched; old API keeps working.

-- ============ 1. CLASS TYPE + extras ============
ALTER TABLE classes ADD COLUMN IF NOT EXISTS class_type TEXT NOT NULL DEFAULT 'Standard'
  CHECK (class_type IN ('Grand Prix','Premier','Open','Standard','Young Horse','Amateur','Pony'));
ALTER TABLE classes ADD COLUMN IF NOT EXISTS course_designer TEXT;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS start_time TIME;

-- ============ 2. RESULT points + status ============
ALTER TABLE round_results ADD COLUMN IF NOT EXISTS points INT NOT NULL DEFAULT 0 CHECK (points >= 0);
ALTER TABLE round_results ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'finished'
  CHECK (status IN ('finished','eliminated','withdrawn','retired'));

-- Points formula (Briefing §5): base × multiplier, rounded, min 0.
CREATE OR REPLACE FUNCTION brief_points(place INT, ctype TEXT)
RETURNS INT AS $$
DECLARE
  base INT := 0;
  mult NUMERIC := 1.0;
BEGIN
  IF place IS NULL OR place < 1 OR place > 10 THEN RETURN 0; END IF;
  base := (ARRAY[12,9,7,6,5,4,3,2,1,1])[place];
  mult := CASE ctype
    WHEN 'Grand Prix' THEN 2.0
    WHEN 'Premier' THEN 1.5
    WHEN 'Open' THEN 1.25
    WHEN 'Amateur' THEN 0.75
    WHEN 'Pony' THEN 0.75
    ELSE 1.0 END;
  RETURN GREATEST(0, ROUND(base * mult));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Auto-score on write; non-finishers always score 0 (FR-14/FR-15).
CREATE OR REPLACE FUNCTION round_results_score()
RETURNS TRIGGER AS $$
DECLARE ct TEXT;
BEGIN
  IF NEW.status <> 'finished' OR NEW.finish_place IS NULL THEN
    NEW.points := 0;
    RETURN NEW;
  END IF;
  SELECT class_type INTO ct FROM classes WHERE id = NEW.class_id;
  NEW.points := brief_points(NEW.finish_place, COALESCE(ct, 'Standard'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS round_results_points_trg ON round_results;
CREATE TRIGGER round_results_points_trg
  BEFORE INSERT OR UPDATE OF finish_place, status, class_id ON round_results
  FOR EACH ROW EXECUTE FUNCTION round_results_score();

-- Backfill existing rows (trigger only fires on listed cols; do it explicitly).
UPDATE round_results rr
SET points = CASE WHEN rr.status <> 'finished' OR rr.finish_place IS NULL THEN 0
                  ELSE brief_points(rr.finish_place, COALESCE(c.class_type, 'Standard')) END
FROM classes c WHERE c.id = rr.class_id;

-- ============ 3. POINT STAT VIEWS (new; old *_stats views untouched) ============
CREATE OR REPLACE VIEW horse_point_stats AS
SELECT
  h.id AS horse_id, h.name AS horse,
  COALESCE(SUM(rr.points), 0)::INT AS total_points,
  COALESCE(SUM(rr.points) FILTER (WHERE c.class_date >= CURRENT_DATE - INTERVAL '12 months'), 0)::INT AS points_12m,
  COALESCE(SUM(rr.points) FILTER (WHERE c.class_date >= CURRENT_DATE - INTERVAL '3 months'), 0)::INT AS points_3m,
  COUNT(rr.id)::INT AS total_starts,
  COUNT(rr.id) FILTER (WHERE c.class_date >= CURRENT_DATE - INTERVAL '12 months')::INT AS starts_12m,
  COUNT(rr.id) FILTER (WHERE c.class_date >= CURRENT_DATE - INTERVAL '3 months')::INT AS starts_3m,
  COUNT(*) FILTER (WHERE rr.finish_place = 1)::INT AS wins,
  COUNT(*) FILTER (WHERE rr.finish_place IS NOT NULL AND rr.finish_place <= 3)::INT AS podiums,
  ROUND(100.0 * COUNT(*) FILTER (WHERE rr.finish_place = 1) / NULLIF(COUNT(rr.id), 0), 2) AS win_rate,
  MAX(c.class_date) AS last_start
FROM horses h
LEFT JOIN round_results rr ON rr.horse_id = h.id
LEFT JOIN classes c ON c.id = rr.class_id
GROUP BY h.id, h.name;

CREATE OR REPLACE VIEW rider_point_stats AS
SELECT
  r.id AS rider_id, r.name AS rider,
  COALESCE(SUM(rr.points), 0)::INT AS total_points,
  COALESCE(SUM(rr.points) FILTER (WHERE c.class_date >= CURRENT_DATE - INTERVAL '12 months'), 0)::INT AS points_12m,
  COALESCE(SUM(rr.points) FILTER (WHERE c.class_date >= CURRENT_DATE - INTERVAL '3 months'), 0)::INT AS points_3m,
  COUNT(rr.id)::INT AS total_starts,
  COUNT(rr.id) FILTER (WHERE c.class_date >= CURRENT_DATE - INTERVAL '12 months')::INT AS starts_12m,
  COUNT(rr.id) FILTER (WHERE c.class_date >= CURRENT_DATE - INTERVAL '3 months')::INT AS starts_3m,
  COUNT(*) FILTER (WHERE rr.finish_place = 1)::INT AS wins,
  COUNT(*) FILTER (WHERE rr.finish_place IS NOT NULL AND rr.finish_place <= 3)::INT AS podiums,
  ROUND(100.0 * COUNT(*) FILTER (WHERE rr.finish_place = 1) / NULLIF(COUNT(rr.id), 0), 2) AS win_rate,
  MAX(c.class_date) AS last_start
FROM riders r
LEFT JOIN round_results rr ON rr.rider_id = r.id
LEFT JOIN classes c ON c.id = rr.class_id
GROUP BY r.id, r.name;

-- ============ 4. SLUGS (FR-05; URLs keep accepting UUIDs too) ============
CREATE OR REPLACE FUNCTION eq_slug(name TEXT)
RETURNS TEXT AS $$
  SELECT NULLIF(substring(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g') from '^-?(.*?)-?$'), '');
$$ LANGUAGE sql IMMUTABLE;

ALTER TABLE horses ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
ALTER TABLE riders ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

UPDATE horses h SET slug = s.slug FROM (
  SELECT id, CASE WHEN rn = 1 THEN base ELSE base || '-' || rn END AS slug FROM (
    SELECT id, COALESCE(eq_slug(name), 'horse-' || substr(id::TEXT, 1, 8)) AS base,
           ROW_NUMBER() OVER (PARTITION BY COALESCE(eq_slug(name), 'horse-' || substr(id::TEXT, 1, 8)) ORDER BY created_at) AS rn
    FROM horses) t) s
WHERE s.id = h.id AND h.slug IS NULL;

UPDATE riders r SET slug = s.slug FROM (
  SELECT id, CASE WHEN rn = 1 THEN base ELSE base || '-' || rn END AS slug FROM (
    SELECT id, COALESCE(eq_slug(name), 'rider-' || substr(id::TEXT, 1, 8)) AS base,
           ROW_NUMBER() OVER (PARTITION BY COALESCE(eq_slug(name), 'rider-' || substr(id::TEXT, 1, 8)) ORDER BY created_at) AS rn
    FROM riders) t) s
WHERE s.id = r.id AND r.slug IS NULL;

UPDATE events e SET slug = s.slug FROM (
  SELECT id, CASE WHEN rn = 1 THEN base ELSE base || '-' || rn END AS slug FROM (
    SELECT id, COALESCE(eq_slug(name), 'event-' || substr(id::TEXT, 1, 8)) AS base,
           ROW_NUMBER() OVER (PARTITION BY COALESCE(eq_slug(name), 'event-' || substr(id::TEXT, 1, 8)) ORDER BY created_at) AS rn
    FROM events) t) s
WHERE s.id = e.id AND e.slug IS NULL;

-- ============ 5. SERIES CATEGORY + profile extras ============
ALTER TABLE riders ADD COLUMN IF NOT EXISTS series_category TEXT
  CHECK (series_category IS NULL OR series_category IN ('Junior','Young Rider','Under 25','Amateur','Pony','Open'));
ALTER TABLE riders ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE riders ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE riders ADD COLUMN IF NOT EXISTS nationality TEXT;
ALTER TABLE riders ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE riders ADD COLUMN IF NOT EXISTS bio TEXT;

ALTER TABLE horses ADD COLUMN IF NOT EXISTS damsire TEXT;
ALTER TABLE horses ADD COLUMN IF NOT EXISTS year_of_birth INT CHECK (year_of_birth IS NULL OR (year_of_birth BETWEEN 1980 AND 2100));
ALTER TABLE horses ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE horses ADD COLUMN IF NOT EXISTS height TEXT;
ALTER TABLE horses ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE horses ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type TEXT
  CHECK (event_type IS NULL OR event_type IN ('Show','Championship','League','Training'));
ALTER TABLE events ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Completed'
  CHECK (status IN ('Upcoming','Live','Completed','Cancelled'));
ALTER TABLE events ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS image_url TEXT;

-- ============ 6. ADMIN tables (FR-04 hash, FR-11 log) ============
CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS admin_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor TEXT NOT NULL DEFAULT 'admin',
  action TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_activity_time_idx ON admin_activity (created_at DESC);
