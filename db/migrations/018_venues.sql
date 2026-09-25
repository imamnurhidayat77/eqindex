-- Venues as first-class entities (best practice: identity + location live
-- once; arena/surface stay per-class because one venue hosts many arenas).
-- Additive only.

CREATE TABLE IF NOT EXISTS venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  region TEXT,
  country TEXT,
  lat NUMERIC, lon NUMERIC,
  default_arena_type TEXT
    CHECK (default_arena_type IS NULL OR default_arena_type IN ('Indoor','Outdoor','Covered outdoor arena','Unknown')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DROP TRIGGER IF EXISTS venues_updated_at ON venues;
CREATE TRIGGER venues_updated_at BEFORE UPDATE ON venues
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS venue_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS events_venue_idx ON events (venue_id);

-- Backfill venues from distinct event venue strings.
INSERT INTO venues (name, normalized_name, region, country)
SELECT DISTINCT ON (regexp_replace(lower(trim(venue)), '[^a-z0-9]+', '-', 'g'))
  trim(venue) AS name,
  NULLIF(regexp_replace(lower(trim(venue)), '[^a-z0-9 ]', '', 'g'), '') AS normalized_name,
  MIN(region) AS region, MIN(venue_country) AS country
FROM events WHERE venue IS NOT NULL AND trim(venue) <> ''
GROUP BY 1, 2
ON CONFLICT (normalized_name) DO NOTHING;

UPDATE events e SET venue_id = v.id FROM venues v
WHERE e.venue_id IS NULL AND v.normalized_name =
  NULLIF(regexp_replace(lower(trim(e.venue)), '[^a-z0-9 ]', '', 'g'), '');

-- ============ Surface split views (horse × arena × surface) ============
CREATE OR REPLACE VIEW horse_surface_stats AS
SELECT
  h.id AS horse_id, h.name AS horse,
  COALESCE(c.arena_type, e.arena_type, 'Unknown') AS arena_type,
  COALESCE(c.surface, 'Unknown') AS surface,
  COUNT(*)::INT AS starts,
  SUM(rr.clear_round::INT)::INT AS clears,
  ROUND(100.0 * AVG(rr.clear_round::INT), 1) AS clear_pct,
  ROUND(AVG(rr.total_faults), 2) AS avg_faults
FROM round_results rr
JOIN horses h ON h.id = rr.horse_id
JOIN classes c ON c.id = rr.class_id
JOIN events e ON e.id = rr.event_id
GROUP BY h.id, h.name, 3, 4;

CREATE OR REPLACE VIEW rider_surface_stats AS
SELECT
  r.id AS rider_id, r.name AS rider,
  COALESCE(c.arena_type, e.arena_type, 'Unknown') AS arena_type,
  COALESCE(c.surface, 'Unknown') AS surface,
  COUNT(*)::INT AS starts,
  SUM(rr.clear_round::INT)::INT AS clears,
  ROUND(100.0 * AVG(rr.clear_round::INT), 1) AS clear_pct,
  ROUND(AVG(rr.total_faults), 2) AS avg_faults
FROM round_results rr
JOIN riders r ON r.id = rr.rider_id
JOIN classes c ON c.id = rr.class_id
JOIN events e ON e.id = rr.event_id
GROUP BY r.id, r.name, 3, 4;
