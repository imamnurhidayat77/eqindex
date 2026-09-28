-- EQIndex EI rating engine — migration 028 (Briefing §13, EI adoption)
-- Per-round weighted points + shrinkage rating, 0–2000 centred 1000.
-- Formula (documented, mirrors EI publicly described methodology):
--   base      = clear?+12 : 0  − 2×jump_faults − 1×time_faults + placing_pts
--               (1st 30, 2nd 24, 3rd 20, 4th 17, 5th 15, 6th 13, 7th 11,
--                8th 9, 9th 7, 10th 5, else 0), clamped ≥ 0.
--               Non-finished rounds score 0 but still count as a round.
--   weighted  = base × height_mult × (DI/50) × field_mult × size_mod
--               × handicap × recency_w
--   height_mult by class height band (NULL height → neutral 1.0):
--     <80:0.42 80–90:0.55 90–100:0.68 100–110:0.82 110–120:0.95
--     120–130:1.10 130–140:1.30 140–150:1.55 ≥150:1.80
--   DI (Difficulty Index, per class): (100−clear%)*0.55 + avg_faults*4
--     + noncomp%*0.9. Non-completion matters: eliminations often record
--     0 faults, so avg faults alone understates difficulty.
--   field_mult: class mean of entrants' career raw base ÷ population mean,
--     clamped 0.6–1.4. One-pass approximation (no recursion): entrant
--     strength uses UNWEIGHTED career averages.
--   size_mod by class starters: ≥25:1.3 ≥15:1.15 ≥10:1.0 ≥5:0.85 else 0.6.
--   handicap (Charles): gap = proven_max_height − class_height
--     (proven = career max jumped; NULL → gap 0).
--     gap ≤ 0 (at/above level): 1 + min(0.30, −gap×0.01)
--     gap > 0 (below level):    1 − min(0.30, gap×0.0075)
--     Pro 160 in 120 → 0.70; beginner 90 in 120 → 1.30.
--   recency_w = 0.63^(days_ago/365)  (~37% decay per year, EI 12m convention).
-- Horse/rider rating (ability per round, recency enters via weights):
--   shrunk = (Σ(w×x) + 25×popmean) / (Σw + 25)      [empirical-Bayes, prior 25]
--   rating = clamp(1000 + 25×(shrunk − popmean), 0, 2000)
--   consistency: prior weight scales with volatility —
--     prior_w = 25×(1 + faults_stddev/10); inconsistent horses shrink harder.
--   age_adj: ±peer-relative, year_of_birth ±2 band (matches /cohort):
--     clamp((raw_avg − peer_raw_avg)×3, −30, +30); NULL age → 0.
--   min 5 rounds to rank; <15 rounds = provisional.
-- ADDITIVE ONLY: views read-only, no stored state (002 pattern).

-- ============ helpers ============
CREATE OR REPLACE FUNCTION ei_height_mult(h INT)
RETURNS NUMERIC AS $$
  SELECT CASE
    WHEN h IS NULL THEN 1.0
    WHEN h < 80 THEN 0.42 WHEN h < 90 THEN 0.55 WHEN h < 100 THEN 0.68
    WHEN h < 110 THEN 0.82 WHEN h < 120 THEN 0.95 WHEN h < 130 THEN 1.10
    WHEN h < 140 THEN 1.30 WHEN h < 150 THEN 1.55 ELSE 1.80 END;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION ei_base(place INT, clear BOOL, sj NUMERIC, tf NUMERIC, st TEXT)
RETURNS NUMERIC AS $$
  SELECT CASE WHEN st <> 'finished' THEN 0 ELSE GREATEST(0,
    (CASE WHEN clear THEN 12 ELSE 0 END)
    - 2*COALESCE(sj,0) - 1*COALESCE(tf,0)
    + COALESCE((ARRAY[30,24,20,17,15,13,11,9,7,5])[place], 0)) END;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION ei_size_mod(n INT)
RETURNS NUMERIC AS $$
  SELECT CASE WHEN n >= 25 THEN 1.3 WHEN n >= 15 THEN 1.15
    WHEN n >= 10 THEN 1.0 WHEN n >= 5 THEN 0.85 ELSE 0.6 END;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION ei_handicap(proven INT, class_h INT)
RETURNS NUMERIC AS $$
  SELECT CASE WHEN proven IS NULL OR class_h IS NULL THEN 1.0
    WHEN (proven - class_h) <= 0 THEN 1 + LEAST(0.30, (class_h - proven)*0.01)
    ELSE 1 - LEAST(0.30, (proven - class_h)*0.0075) END;
$$ LANGUAGE sql IMMUTABLE;

-- ============ per-class context (DI, size, field strength) ============
CREATE OR REPLACE VIEW ei_class_ctx AS
WITH cagg AS (
  SELECT c.id AS class_id,
    COUNT(*)::INT AS starters,
    100.0*AVG(rr.clear_round::INT) AS clear_pct,
    AVG(rr.total_faults) AS avg_faults,
    100.0*AVG((rr.status<>'finished')::INT) AS noncomp_pct
  FROM round_results rr JOIN classes c ON c.id = rr.class_id
  GROUP BY c.id
),
career AS (
  SELECT rr.horse_id, AVG(ei_base(rr.finish_place, rr.clear_round,
    rr.jump_faults, rr.time_faults, rr.status)) AS raw_avg
  FROM round_results rr GROUP BY rr.horse_id
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

-- ============ per-round weighted components ============
CREATE OR REPLACE VIEW ei_round AS
SELECT rr.id, rr.horse_id, rr.rider_id, rr.class_id,
  COALESCE(rr.height_cm, c.height_cm) AS h,
  c.class_date,
  ei_base(rr.finish_place, rr.clear_round, rr.jump_faults, rr.time_faults, rr.status) AS base,
  ei_height_mult(COALESCE(rr.height_cm, c.height_cm)) AS height_mult,
  (SELECT di FROM ei_class_ctx x WHERE x.class_id = rr.class_id) / 50.0 AS di_mult,
  (SELECT field_mult FROM ei_class_ctx x WHERE x.class_id = rr.class_id) AS field_mult,
  ei_size_mod((SELECT starters FROM ei_class_ctx x WHERE x.class_id = rr.class_id)) AS size_mod,
  POWER(0.63, GREATEST(0, CURRENT_DATE - c.class_date) / 365.0) AS recency_w
FROM round_results rr JOIN classes c ON c.id = rr.class_id;

-- ============ horse rating ============
CREATE OR REPLACE VIEW horse_ei_rating AS
WITH w AS (
  SELECT e.*,
    e.base * e.height_mult * e.di_mult * e.field_mult * e.size_mod
      * ei_handicap(hp.proven, e.h) * e.recency_w AS weighted,
    hp.proven
  FROM ei_round e
  LEFT JOIN (SELECT horse_id, MAX(h) AS proven FROM ei_round GROUP BY horse_id) hp
    ON hp.horse_id = e.horse_id
),
agg AS (
  SELECT horse_id, COUNT(*)::INT AS starts, SUM(recency_w) AS eff_n,
    SUM(weighted) AS wsum,
    AVG(base) AS raw_avg,
    STDDEV_POP(base) AS base_sd,
    AVG(weighted/NULLIF(recency_w,0)) AS unw_avg
  FROM w GROUP BY horse_id
),
pop AS (SELECT AVG(raw_avg) AS m, STDDEV_POP(raw_avg) AS s FROM agg WHERE starts >= 5),
peer AS (
  SELECT h.id AS horse_id, AVG(a2.raw_avg) AS peer_avg
  FROM horses h
  JOIN horses h2 ON h2.year_of_birth BETWEEN h.year_of_birth - 2 AND h.year_of_birth + 2
  JOIN agg a2 ON a2.horse_id = h2.id
  WHERE h.year_of_birth IS NOT NULL
  GROUP BY h.id
)
SELECT h.id AS horse_id, h.name AS horse, h.slug AS horse_slug,
  a.starts, ROUND(a.eff_n, 2) AS eff_starts,
  ROUND(a.raw_avg, 2) AS raw_avg,
  ROUND(a.base_sd, 2) AS base_sd,
  ROUND((a.wsum + (25*(1 + COALESCE(a.base_sd,0)/10))*(SELECT m FROM pop))
    / NULLIF(a.eff_n + (25*(1 + COALESCE(a.base_sd,0)/10)), 0), 2) AS shrunk_avg,
  LEAST(2000, GREATEST(0, ROUND(1000 + 25*(
    (a.wsum + (25*(1 + COALESCE(a.base_sd,0)/10))*(SELECT m FROM pop))
    / NULLIF(a.eff_n + (25*(1 + COALESCE(a.base_sd,0)/10)), 0)
    - (SELECT m FROM pop)))))::INT AS rating,
  (a.starts < 15) AS provisional,
  ROUND(COALESCE(GREATEST(-30, LEAST(30, (a.raw_avg - p.peer_avg)*3)), 0), 1) AS age_adj,
  s.clears, s.clear_pct, s.avg_faults, s.faults_stddev, s.wins, s.best_place, s.last_start
FROM horses h
JOIN agg a ON a.horse_id = h.id
LEFT JOIN peer p ON p.horse_id = h.id
LEFT JOIN horse_stats s ON s.horse_id = h.id;

-- ============ rider rating (symmetric) ============
CREATE OR REPLACE VIEW rider_ei_rating AS
WITH w AS (
  SELECT e.*,
    e.base * e.height_mult * e.di_mult * e.field_mult * e.size_mod
      * ei_handicap(rp.proven, e.h) * e.recency_w AS weighted,
    rp.proven
  FROM ei_round e
  LEFT JOIN (SELECT rider_id, MAX(h) AS proven FROM ei_round GROUP BY rider_id) rp
    ON rp.rider_id = e.rider_id
),
agg AS (
  SELECT rider_id, COUNT(*)::INT AS starts, SUM(recency_w) AS eff_n,
    SUM(weighted) AS wsum,
    AVG(base) AS raw_avg,
    STDDEV_POP(base) AS base_sd
  FROM w GROUP BY rider_id
),
pop AS (SELECT AVG(raw_avg) AS m FROM agg WHERE starts >= 5)
SELECT r.id AS rider_id, r.name AS rider, r.slug AS rider_slug, r.series_category,
  a.starts, ROUND(a.eff_n, 2) AS eff_starts,
  ROUND(a.raw_avg, 2) AS raw_avg,
  ROUND(a.base_sd, 2) AS base_sd,
  ROUND((a.wsum + (25*(1 + COALESCE(a.base_sd,0)/10))*(SELECT m FROM pop))
    / NULLIF(a.eff_n + (25*(1 + COALESCE(a.base_sd,0)/10)), 0), 2) AS shrunk_avg,
  LEAST(2000, GREATEST(0, ROUND(1000 + 25*(
    (a.wsum + (25*(1 + COALESCE(a.base_sd,0)/10))*(SELECT m FROM pop))
    / NULLIF(a.eff_n + (25*(1 + COALESCE(a.base_sd,0)/10)), 0)
    - (SELECT m FROM pop)))))::INT AS rating,
  (a.starts < 15) AS provisional,
  s.clears, s.clear_pct, s.avg_faults, s.wins, s.horses_ridden, s.last_start
FROM riders r
JOIN agg a ON a.rider_id = r.id
LEFT JOIN rider_stats s ON s.rider_id = r.id;
