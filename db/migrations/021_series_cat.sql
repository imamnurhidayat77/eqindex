-- Category in point views (series tables per rider category).
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
  r.series_category
FROM riders r
LEFT JOIN round_results rr ON rr.rider_id = r.id
LEFT JOIN classes c ON c.id = rr.class_id
GROUP BY r.id, r.name, r.series_category;
