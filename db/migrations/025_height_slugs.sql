-- horse_height_stats gains horse_slug (appended last).
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
WHERE rr.height_cm IS NOT NULL
GROUP BY h.id, h.name, rr.height_cm, h.slug;
