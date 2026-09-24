-- EQIndex analytics views — Step 5 (PRD §7.5, §7.6)
-- Semua metrik dihitung dari round_results; views read-only, no stored state.
-- clear_round% | avg faults | consistency | partnership | event difficulty

-- ============ HORSE STATS ============
CREATE OR REPLACE VIEW horse_stats AS
SELECT
  h.id AS horse_id,
  h.name AS horse,
  COUNT(*) AS starts,
  SUM(rr.clear_round::INT) AS clears,
  ROUND(100.0 * AVG(rr.clear_round::INT), 1) AS clear_pct,
  ROUND(AVG(rr.total_faults), 2) AS avg_faults,
  ROUND(STDDEV_POP(rr.total_faults), 2) AS faults_stddev, -- consistency: kecil = konsisten
  COUNT(*) FILTER (WHERE rr.finish_place = 1) AS wins,
  MIN(rr.finish_place) AS best_place,
  MAX(c.class_date) AS last_start
FROM horses h
JOIN round_results rr ON rr.horse_id = h.id
JOIN classes c ON c.id = rr.class_id
GROUP BY h.id, h.name;

-- ============ RIDER STATS ============
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
  MAX(c.class_date) AS last_start
FROM riders r
JOIN round_results rr ON rr.rider_id = r.id
JOIN classes c ON c.id = rr.class_id
GROUP BY r.id, r.name;

-- ============ PARTNERSHIP STATS (PRD §7.6) ============
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
  MAX(c.class_date) AS last_start
FROM round_results rr
JOIN horses h ON h.id = rr.horse_id
JOIN riders r ON r.id = rr.rider_id
JOIN classes c ON c.id = rr.class_id
GROUP BY h.id, r.id, h.name, r.name;

-- ============ CLASS STATS (event difficulty, PRD §7.5/§7.7) ============
CREATE OR REPLACE VIEW class_stats AS
SELECT
  c.id AS class_id,
  e.name AS event,
  c.name AS class,
  c.height_cm,
  c.field_size AS starters,
  SUM(rr.clear_round::INT) AS clears,
  ROUND(100.0 * AVG(rr.clear_round::INT), 1) AS clear_pct, -- rendah = sulit
  ROUND(AVG(rr.total_faults), 2) AS avg_faults,            -- tinggi = sulit
  e.season
FROM classes c
JOIN events e ON e.id = c.event_id
LEFT JOIN round_results rr ON rr.class_id = c.id
GROUP BY c.id, e.name, c.name, c.height_cm, c.field_size, e.season;
