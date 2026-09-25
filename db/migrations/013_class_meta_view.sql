-- Expose class metadata in class_stats (appended last; OR REPLACE keeps order).
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
  c.result_status
FROM classes c
JOIN events e ON e.id = c.event_id
LEFT JOIN round_results rr ON rr.class_id = c.id
GROUP BY c.id, e.name, c.name, c.height_cm, c.field_size, e.season,
         c.class_type, c.class_number, c.format, c.sponsor, c.series_key, c.result_status;
