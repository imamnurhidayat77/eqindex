-- EQIndex band-scoped rating — migration 031 (Briefing §9/§13, height groups)
-- horse_eqindex_band(h_min, h_max) / rider_eqindex_band(h_min, h_max):
-- the SAME EI pipeline as horse/rider_eqindex_rating (migration 028),
-- restricted to rounds whose height falls in [h_min, h_max].
-- NULL bound = open-ended (band('-100') passes h_min=NULL, h_max=100).
--
-- Scope rules (documented, deliberate):
-- - rounds: COALESCE(rr.height_cm, c.height_cm) within bounds, inclusive
--   (mirrors roundFilters); NULL heights drop out only when banded.
-- - proven (handicap): CAREER max, unfiltered. A pro dropping down into a
--   low band is still discounted — that is the point of the handicap.
-- - DI / field_mult / size_mod: GLOBAL per-class values from
--   eqindex_class_ctx. Difficulty is a property of the class, not the viewer.
-- - popmean + peer_avg: BAND population (coherent within-band board).
-- - clears/clear_pct/avg_faults/stddev/wins/best_place/last_start: band-scoped
--   (recomputed here, NOT from horse_stats/rider_stats).
-- - provisional: starts < 15, same rule as career board.
-- With both bounds NULL the output matches the career views exactly.
-- ADDITIVE ONLY: existing views/functions untouched.

-- ============ horse band rating ============
CREATE OR REPLACE FUNCTION horse_eqindex_band(h_min INT, h_max INT)
RETURNS TABLE (
  horse_id UUID, horse TEXT, horse_slug TEXT,
  starts INT, eff_starts NUMERIC, raw_avg NUMERIC, shrunk_avg NUMERIC,
  rating INT, provisional BOOL, age_adj NUMERIC,
  clears BIGINT, clear_pct NUMERIC, avg_faults NUMERIC, faults_stddev NUMERIC,
  wins BIGINT, best_place INT, last_start DATE
)
LANGUAGE sql STABLE AS $$
WITH w AS (
  SELECT e.*,
    e.base * e.height_mult * e.di_mult * e.field_mult * e.size_mod
      * eqindex_handicap(hp.proven, e.h) * e.recency_w AS weighted,
    hp.proven
  FROM eqindex_round e
  LEFT JOIN (SELECT horse_id, MAX(h) AS proven FROM eqindex_round GROUP BY horse_id) hp
    ON hp.horse_id = e.horse_id
  WHERE (h_min IS NULL OR e.h >= h_min)
    AND (h_max IS NULL OR e.h <= h_max)
),
agg AS (
  SELECT e.horse_id,
    COUNT(*)::INT AS starts,
    SUM(e.recency_w) AS eff_n,
    SUM(e.weighted) AS wsum,
    AVG(e.base) AS raw_avg,
    STDDEV_POP(e.base) AS base_sd,
    SUM(br.clear_round::INT) AS clears,
    ROUND(100.0 * AVG(br.clear_round::INT), 1) AS clear_pct,
    ROUND(AVG(br.total_faults), 2) AS avg_faults,
    ROUND(STDDEV_POP(br.total_faults), 2) AS faults_stddev,
    COUNT(*) FILTER (WHERE br.finish_place = 1) AS wins,
    MIN(br.finish_place) AS best_place,
    MAX(c.class_date) AS last_start
  FROM w e
  JOIN round_results br ON br.id = e.id
  JOIN classes c ON c.id = br.class_id
  GROUP BY e.horse_id
),
pop AS (SELECT COALESCE(
    (SELECT AVG(raw_avg) FROM agg WHERE starts >= 5),
    (SELECT AVG(raw_avg) FROM agg)) AS m),
peer AS (
  SELECT h.id AS horse_id, AVG(a2.raw_avg) AS peer_avg
  FROM horses h
  JOIN horses h2 ON h2.year_of_birth BETWEEN h.year_of_birth - 2 AND h.year_of_birth + 2
  JOIN agg a2 ON a2.horse_id = h2.id
  WHERE h.year_of_birth IS NOT NULL
  GROUP BY h.id
)
SELECT h.id AS horse_id, h.name AS horse, h.slug AS horse_slug,
  a.starts, ROUND(a.eff_n, 2)::NUMERIC AS eff_starts,
  ROUND(a.raw_avg, 2) AS raw_avg,
  ROUND((a.wsum + (25*(1 + COALESCE(a.base_sd,0)/10))*(SELECT m FROM pop))
    / NULLIF(a.eff_n + (25*(1 + COALESCE(a.base_sd,0)/10)), 0), 2)::NUMERIC AS shrunk_avg,
  LEAST(2000, GREATEST(0, ROUND(1000 + 25*(
    (a.wsum + (25*(1 + COALESCE(a.base_sd,0)/10))*(SELECT m FROM pop))
    / NULLIF(a.eff_n + (25*(1 + COALESCE(a.base_sd,0)/10)), 0)
    - (SELECT m FROM pop))
    + COALESCE(GREATEST(-30, LEAST(30, (a.raw_avg - p.peer_avg)*3)), 0))))::INT AS rating,
  (a.starts < 15) AS provisional,
  ROUND(COALESCE(GREATEST(-30, LEAST(30, (a.raw_avg - p.peer_avg)*3)), 0), 1) AS age_adj,
  a.clears, a.clear_pct, a.avg_faults, a.faults_stddev, a.wins, a.best_place, a.last_start
FROM horses h
JOIN agg a ON a.horse_id = h.id
LEFT JOIN peer p ON p.horse_id = h.id;
$$;

-- ============ rider band rating (symmetric) ============
CREATE OR REPLACE FUNCTION rider_eqindex_band(h_min INT, h_max INT)
RETURNS TABLE (
  rider_id UUID, rider TEXT, rider_slug TEXT, series_category TEXT,
  starts INT, eff_starts NUMERIC, raw_avg NUMERIC, shrunk_avg NUMERIC,
  rating INT, provisional BOOL,
  clears BIGINT, clear_pct NUMERIC, avg_faults NUMERIC,
  wins BIGINT, horses_ridden INT, last_start DATE
)
LANGUAGE sql STABLE AS $$
WITH w AS (
  SELECT e.*,
    e.base * e.height_mult * e.di_mult * e.field_mult * e.size_mod
      * eqindex_handicap(rp.proven, e.h) * e.recency_w AS weighted,
    rp.proven
  FROM eqindex_round e
  LEFT JOIN (SELECT rider_id, MAX(h) AS proven FROM eqindex_round GROUP BY rider_id) rp
    ON rp.rider_id = e.rider_id
  WHERE (h_min IS NULL OR e.h >= h_min)
    AND (h_max IS NULL OR e.h <= h_max)
),
agg AS (
  SELECT e.rider_id,
    COUNT(*)::INT AS starts,
    SUM(e.recency_w) AS eff_n,
    SUM(e.weighted) AS wsum,
    AVG(e.base) AS raw_avg,
    STDDEV_POP(e.base) AS base_sd,
    SUM(br.clear_round::INT) AS clears,
    ROUND(100.0 * AVG(br.clear_round::INT), 1) AS clear_pct,
    ROUND(AVG(br.total_faults), 2) AS avg_faults,
    COUNT(*) FILTER (WHERE br.finish_place = 1) AS wins,
    COUNT(DISTINCT br.horse_id)::INT AS horses_ridden,
    MAX(c.class_date) AS last_start
  FROM w e
  JOIN round_results br ON br.id = e.id
  JOIN classes c ON c.id = br.class_id
  GROUP BY e.rider_id
),
pop AS (SELECT COALESCE(
    (SELECT AVG(raw_avg) FROM agg WHERE starts >= 5),
    (SELECT AVG(raw_avg) FROM agg)) AS m)
SELECT r.id AS rider_id, r.name AS rider, r.slug AS rider_slug, r.series_category,
  a.starts, ROUND(a.eff_n, 2)::NUMERIC AS eff_starts,
  ROUND(a.raw_avg, 2) AS raw_avg,
  ROUND((a.wsum + (25*(1 + COALESCE(a.base_sd,0)/10))*(SELECT m FROM pop))
    / NULLIF(a.eff_n + (25*(1 + COALESCE(a.base_sd,0)/10)), 0), 2)::NUMERIC AS shrunk_avg,
  LEAST(2000, GREATEST(0, ROUND(1000 + 25*(
    (a.wsum + (25*(1 + COALESCE(a.base_sd,0)/10))*(SELECT m FROM pop))
    / NULLIF(a.eff_n + (25*(1 + COALESCE(a.base_sd,0)/10)), 0)
    - (SELECT m FROM pop)))))::INT AS rating,
  (a.starts < 15) AS provisional,
  a.clears, a.clear_pct, a.avg_faults, a.wins, a.horses_ridden, a.last_start
FROM riders r
JOIN agg a ON a.rider_id = r.id;
$$;
