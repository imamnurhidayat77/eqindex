-- Class visibility switches — migration 032.
-- Per-class on/off (classes.is_active, same pattern as events.is_active) plus a
-- per-category kill list (admin_settings 'excluded_class_types', JSON array of
-- class_type values). Excluded classes STAY in the DB (audit trail, profiles
-- keep raw history) but vanish from every aggregate: stat views below filter
-- them, and the API applies the same predicate to live queries via
-- roundFilters()/classVisibility helpers.
-- Additive only. Safe to run before/after 030/031 (all IF NOT EXISTS).

ALTER TABLE classes ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS classes_active_idx ON classes (is_active);

INSERT INTO admin_settings (key, value) VALUES ('excluded_class_types', '[]')
ON CONFLICT (key) DO NOTHING;

-- Category kill list: TRUE when p_class_type is switched off in settings.
-- Fail-open: a corrupt settings value behaves as "nothing excluded".
CREATE OR REPLACE FUNCTION class_excluded(p_class_type TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT CASE WHEN value ~ '^\s*\[' THEN value::jsonb ELSE '[]'::jsonb END
     FROM admin_settings WHERE key = 'excluded_class_types'),
    '[]'::jsonb
  ) @> to_jsonb(COALESCE(p_class_type, ''));
$$;

-- Full visibility check for a class id. NULL (shouldn't happen — class_id is
-- required on round_results) counts as visible to preserve view semantics.
CREATE OR REPLACE FUNCTION class_id_visible(p_class_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT COALESCE((
    SELECT c.is_active IS NOT FALSE AND NOT class_excluded(c.class_type)
    FROM classes c WHERE c.id = p_class_id
  ), TRUE);
$$;

-- ============ stat views (023 latest) ============
CREATE OR REPLACE VIEW horse_stats AS
SELECT
  h.id AS horse_id,
  h.name AS horse,
  COUNT(*) AS starts,
  SUM(rr.clear_round::INT) AS clears,
  ROUND(100.0 * AVG(rr.clear_round::INT), 1) AS clear_pct,
  ROUND(AVG(rr.total_faults), 2) AS avg_faults,
  ROUND(STDDEV_POP(rr.total_faults), 2) AS faults_stddev,
  COUNT(*) FILTER (WHERE rr.finish_place = 1) AS wins,
  MIN(rr.finish_place) AS best_place,
  MAX(c.class_date) AS last_start,
  h.slug AS horse_slug
FROM horses h
JOIN round_results rr ON rr.horse_id = h.id
JOIN classes c ON c.id = rr.class_id
WHERE c.is_active IS NOT FALSE AND NOT class_excluded(c.class_type)
GROUP BY h.id, h.name, h.slug;

CREATE OR REPLACE VIEW rider_stats AS
SELECT
  r.id AS rider_id,
  r.name AS rider,
  COUNT(*) AS starts,
  SUM(rr.clear_round::INT) AS clears,
  ROUND(100.0 * AVG(rr.clear_round::INT), 1) AS clear_pct,
  ROUND(AVG(rr.total_faults), 2) AS avg_faults,
  COUNT(*) FILTER (WHERE rr.finish_place = 1) AS wins,
  COUNT(DISTINCT rr.horse_id) AS horses_ridden,
  MAX(c.class_date) AS last_start,
  r.slug AS rider_slug
FROM riders r
JOIN round_results rr ON rr.rider_id = r.id
JOIN classes c ON c.id = rr.class_id
WHERE c.is_active IS NOT FALSE AND NOT class_excluded(c.class_type)
GROUP BY r.id, r.name, r.slug;

CREATE OR REPLACE VIEW partnership_stats AS
SELECT
  h.id AS horse_id,
  r.id AS rider_id,
  h.name AS horse,
  r.name AS rider,
  COUNT(*) AS rounds_together,
  SUM(rr.clear_round::INT) AS clears,
  ROUND(100.0 * AVG(rr.clear_round::INT), 1) AS clear_pct,
  ROUND(AVG(rr.total_faults), 2) AS avg_faults,
  MIN(rr.finish_place) AS best_place,
  MAX(c.class_date) AS last_start,
  h.slug AS horse_slug,
  r.slug AS rider_slug
FROM round_results rr
JOIN horses h ON h.id = rr.horse_id
JOIN riders r ON r.id = rr.rider_id
JOIN classes c ON c.id = rr.class_id
WHERE c.is_active IS NOT FALSE AND NOT class_excluded(c.class_type)
GROUP BY h.id, r.id, h.name, r.name, h.slug, r.slug;

-- ============ class_stats (015 latest): hidden classes vanish ============
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
WHERE c.is_active IS NOT FALSE AND NOT class_excluded(c.class_type)
GROUP BY c.id, e.name, c.name, c.height_cm, c.field_size, e.season,
         c.class_type, c.class_number, c.format, c.sponsor, c.series_key,
         c.result_status, c.arena_type, c.surface;

-- ============ points views (024 latest): LEFT JOIN preserved ============
-- The visibility predicate sits in the ON clause so horses/riders with only
-- hidden rounds still appear (with zeros) instead of dropping out.
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
  MAX(c.class_date) AS last_start,
  NOW() AS last_updated,
  h.slug AS horse_slug
FROM horses h
LEFT JOIN round_results rr ON rr.horse_id = h.id AND class_id_visible(rr.class_id)
LEFT JOIN classes c ON c.id = rr.class_id
GROUP BY h.id, h.name, h.slug;

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
  MAX(c.class_date) AS last_start,
  NOW() AS last_updated,
  r.series_category,
  r.slug AS rider_slug
FROM riders r
LEFT JOIN round_results rr ON rr.rider_id = r.id AND class_id_visible(rr.class_id)
LEFT JOIN classes c ON c.id = rr.class_id
GROUP BY r.id, r.name, r.slug, r.series_category;

-- ============ height + surface splits (025/018 latest) ============
CREATE OR REPLACE VIEW horse_height_stats AS
SELECT
  h.id AS horse_id, h.name AS horse, rr.height_cm,
  COUNT(*) AS starts,
  SUM(rr.clear_round::INT) AS clears,
  ROUND(100.0 * AVG(rr.clear_round::INT), 1) AS clear_pct,
  ROUND(AVG(rr.total_faults), 2) AS avg_faults,
  h.slug AS horse_slug
FROM horses h
JOIN round_results rr ON rr.horse_id = h.id
WHERE rr.height_cm IS NOT NULL AND class_id_visible(rr.class_id)
GROUP BY h.id, h.name, rr.height_cm, h.slug;

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
WHERE c.is_active IS NOT FALSE AND NOT class_excluded(c.class_type)
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
WHERE c.is_active IS NOT FALSE AND NOT class_excluded(c.class_type)
GROUP BY r.id, r.name, 3, 4;

-- ============ EI context + rounds (028, renamed 029): ratings inherit via eqindex_round ============
CREATE OR REPLACE VIEW eqindex_class_ctx AS
WITH cagg AS (
  SELECT c.id AS class_id,
    COUNT(*)::INT AS starters,
    100.0*AVG(rr.clear_round::INT) AS clear_pct,
    AVG(rr.total_faults) AS avg_faults,
    100.0*AVG((rr.status<>'finished')::INT) AS noncomp_pct
  FROM round_results rr JOIN classes c ON c.id = rr.class_id
  WHERE c.is_active IS NOT FALSE AND NOT class_excluded(c.class_type)
  GROUP BY c.id
),
career AS (
  SELECT rr.horse_id, AVG(eqindex_base(rr.finish_place, rr.clear_round,
    rr.jump_faults, rr.time_faults, rr.status)) AS raw_avg
  FROM round_results rr JOIN classes c ON c.id = rr.class_id
  WHERE c.is_active IS NOT FALSE AND NOT class_excluded(c.class_type)
  GROUP BY rr.horse_id
),
pop AS (SELECT AVG(raw_avg) AS m FROM career),
fstr AS (
  SELECT rr.class_id, AVG(ch.raw_avg) AS cls_mean
  FROM round_results rr JOIN career ch ON ch.horse_id = rr.horse_id
  GROUP BY rr.class_id
)
SELECT ca.class_id, ca.starters,
  LEAST(150, GREATEST(5,
    (100-ca.clear_pct)*0.55 + ca.avg_faults*4.0 + ca.noncomp_pct*0.9)) AS di,
  GREATEST(0.6, LEAST(1.4, (SELECT f.cls_mean FROM fstr f WHERE f.class_id = ca.class_id)
    / NULLIF((SELECT m FROM pop), 0))) AS field_mult
FROM cagg ca;

CREATE OR REPLACE VIEW eqindex_round AS
SELECT rr.id, rr.horse_id, rr.rider_id, rr.class_id,
  COALESCE(rr.height_cm, c.height_cm) AS h,
  c.class_date,
  eqindex_base(rr.finish_place, rr.clear_round, rr.jump_faults, rr.time_faults, rr.status) AS base,
  eqindex_height_mult(COALESCE(rr.height_cm, c.height_cm)) AS height_mult,
  (SELECT di FROM eqindex_class_ctx x WHERE x.class_id = rr.class_id) / 50.0 AS di_mult,
  (SELECT field_mult FROM eqindex_class_ctx x WHERE x.class_id = rr.class_id) AS field_mult,
  eqindex_size_mod((SELECT starters FROM eqindex_class_ctx x WHERE x.class_id = rr.class_id)) AS size_mod,
  POWER(0.63, GREATEST(0, CURRENT_DATE - c.class_date) / 365.0) AS recency_w
FROM round_results rr JOIN classes c ON c.id = rr.class_id
WHERE c.is_active IS NOT FALSE AND NOT class_excluded(c.class_type);
