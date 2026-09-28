-- Slug columns (appended last) for points views used by ?metric=points rankings.
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
LEFT JOIN round_results rr ON rr.horse_id = h.id
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
LEFT JOIN round_results rr ON rr.rider_id = r.id
LEFT JOIN classes c ON c.id = rr.class_id
GROUP BY r.id, r.name, r.slug, r.series_category;
