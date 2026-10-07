-- Model B per-rider rating (mirrors modelb_horse): best-N rounds per rider
-- across all horses, N from config. Feeds Top Rated Riders boards/lists.
CREATE OR REPLACE VIEW modelb_rider AS
WITH ranked AS (
  SELECT rider_id, horse_id, modelb,
    ROW_NUMBER() OVER (PARTITION BY rider_id ORDER BY modelb DESC) AS rn,
    COUNT(*) OVER (PARTITION BY rider_id)::INT AS rounds
  FROM modelb_round WHERE modelb IS NOT NULL
),
agg AS (
  SELECT rider_id,
    MAX(rounds) AS rounds,
    SUM(modelb) FILTER (
      WHERE rn <= COALESCE((modelb_cfg()->>'bestN')::INT, 12)) AS best12,
    ROUND(AVG(modelb), 1) AS avg_round,
    MAX(modelb) AS best_round,
    COUNT(DISTINCT horse_id)::INT AS horses_ridden
  FROM ranked
  GROUP BY rider_id
)
SELECT a.rider_id, rd.name AS rider,
  a.rounds, a.best12, a.avg_round, a.best_round, a.horses_ridden,
  RANK() OVER (ORDER BY a.best12 DESC)::INT AS rank
FROM agg a
JOIN riders rd ON rd.id = a.rider_id;
