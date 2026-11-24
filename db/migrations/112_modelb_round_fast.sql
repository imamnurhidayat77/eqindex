-- Model B speed-up (no scoring change). 057's modelb_round called
-- modelb_cfg() ~25 times per row (each call re-reads scoring_versions and
-- re-parses the default JSON), plus class_id_visible/class_excluded per row
-- (2 more lookups). /rankings/modelb/horses|riders took 13-18 s.
-- This version reads the config and the excluded class types ONCE
-- (MATERIALIZED CTEs) and evaluates the same formulas inline. Every
-- multiplier keeps 047/057's exact expression and fallbacks, so scores are
-- identical (checked row by row against the old view before shipping).
-- The modelb_* functions stay for other callers.
-- Columns unchanged -> CREATE OR REPLACE is safe over dependent views.
CREATE OR REPLACE VIEW modelb_round AS
WITH k AS MATERIALIZED (
  SELECT c,
    COALESCE((c->>'elimMult')::NUMERIC, 0.05) AS elim,
    COALESCE((c->>'fieldMinBonus')::NUMERIC, 1.15) AS fmin,
    (c->>'placeK')::NUMERIC AS pk,
    (c->>'placeExp')::NUMERIC AS pe,
    COALESCE((c->>'fieldBase')::NUMERIC, 0.4) AS fb,
    COALESCE((c->>'fieldFull')::NUMERIC, 50) AS ff,
    COALESCE((c->>'diffK')::NUMERIC, 0.5) AS dk,
    COALESCE((c->>'dcBonus')::NUMERIC, 1.1) AS dc,
    (c->'lowHeight'->>'base')::NUMERIC AS lb,
    (c->'lowHeight'->>'fromCm')::NUMERIC AS lf,
    (c->'lowHeight'->>'perCm')::NUMERIC AS lp,
    COALESCE(
      (SELECT CASE WHEN value ~ '^\s*\[' THEN value::jsonb ELSE '[]'::jsonb END
       FROM admin_settings WHERE key = 'excluded_class_types'),
      '[]'::jsonb) AS excl
  FROM (SELECT modelb_cfg() AS c) cfg
),
hb AS MATERIALIZED (
  SELECT (e->>0)::NUMERIC AS cm, (e->>1)::NUMERIC AS pts
  FROM k, jsonb_array_elements(k.c->'heightBase') e
),
src AS (
  SELECT rr.id, rr.horse_id, rr.rider_id, rr.class_id,
    COALESCE(rr.height_cm, c.height_cm) AS hraw,
    COALESCE(NULLIF(c.field_size, 0), s.starters) AS field,
    s.clear_rate, rr.finish_place, rr.total_faults,
    rr.status, rr.time_seconds, rr.clear_round,
    rr.jumpoff_faults, rr.round2_faults,
    e.event_kind, e.tier, c.format
  FROM round_results rr
  JOIN classes c ON c.id = rr.class_id
  JOIN events e ON e.id = rr.event_id
  CROSS JOIN k
  JOIN LATERAL (
    SELECT COUNT(*)::INT AS starters,
      AVG(x.clear_round::INT)::NUMERIC AS clear_rate
    FROM round_results x WHERE x.class_id = rr.class_id
  ) s ON true
  -- = class_id_visible(): the inner join already drops a missing class.
  WHERE c.is_active IS NOT FALSE
    AND NOT (k.excl @> to_jsonb(COALESCE(c.class_type, '')))
),
m AS (
  SELECT src.*,
    CASE WHEN hraw IS NULL THEN NULL ELSE COALESCE(
      (SELECT hb.pts FROM hb WHERE hb.cm <= hraw ORDER BY hb.cm DESC LIMIT 1),
      k.lb + (hraw - k.lf) * k.lp) END AS base_v,
    CASE WHEN status <> 'finished' AND time_seconds IS NULL THEN k.elim
      WHEN total_faults IS NULL THEN NULL
      ELSE (k.c->'faults' ->> CASE WHEN total_faults <= 16
        THEN GREATEST(total_faults, 0)::INT::TEXT ELSE 'over16' END)::NUMERIC
    END AS perf_v,
    CASE WHEN field IS NULL OR field <= 1 THEN k.fmin
      WHEN finish_place IS NULL THEN 1.0
      ELSE 1 + k.pk * POWER(
        (field - LEAST(finish_place, field))::NUMERIC / (field - 1), k.pe)
    END AS place_v,
    (k.fb + (1 - k.fb) * LEAST(1, LN(GREATEST(COALESCE(field, 2), 2)) / LN(k.ff)))::NUMERIC AS field_v,
    (1 + k.dk * (0.5 - COALESCE(clear_rate, 0.5))) AS diff_v,
    CASE
      WHEN COALESCE(k.c->'eventProfiles'->'HOY', '[]') ? event_kind
        THEN (k.c->'eventMult'->>'HOY')::NUMERIC
      WHEN COALESCE(k.c->'eventProfiles'->'Finals', '[]') ? event_kind
        THEN (k.c->'eventMult'->>'Finals')::NUMERIC
      WHEN COALESCE(k.c->'eventProfiles'->'PremierTiers', '[]') ? tier
        THEN (k.c->'eventMult'->>'Premier')::NUMERIC
      ELSE (k.c->'eventMult'->>'Other')::NUMERIC
    END AS event_v,
    COALESCE((k.c->'classTypeMult'->>format)::NUMERIC, 1) AS class_v,
    CASE WHEN clear_round
      AND ((jumpoff_faults IS NOT NULL AND jumpoff_faults = 0)
        OR (round2_faults IS NOT NULL AND round2_faults = 0))
      THEN k.dc ELSE 1 END AS dc_v
  FROM src CROSS JOIN k
)
SELECT id, horse_id, rider_id, class_id,
  hraw::INT AS h,
  base_v AS base, perf_v AS perf, place_v AS place_m, field_v AS field_m,
  diff_v AS diff_m, event_v AS event_m, class_v AS class_m, dc_v AS dc_m,
  ROUND(base_v * perf_v * place_v * field_v * diff_v * event_v * class_v * dc_v, 1) AS modelb
FROM m;

-- Rank fix: 049 ranked eligible horses/riders among ALL rows, so horses
-- without enough rounds (no rank shown) still pushed real ones down. The only
-- eligible horse showed "#696" on its profile while /horses listed it #1.
-- Rank is now counted among eligible rows only. Columns unchanged.
-- ---- horse rank: last-N per horse, drop-D worst, min-M to rank ----
CREATE OR REPLACE VIEW modelb_rank_horse AS
WITH w AS (SELECT * FROM modelb_window('horse')),
ordered AS (
  SELECT f.*,
    ROW_NUMBER() OVER (PARTITION BY f.horse_id
      ORDER BY f.class_date DESC NULLS LAST, f.round_id) AS rn
  FROM modelb_form f, w
),
windowed AS (
  SELECT o.*, (SELECT last_n FROM w) AS last_n,
    (SELECT drop_n FROM w) AS drop_n, (SELECT min_n FROM w) AS min_n
  FROM ordered o WHERE o.rn <= (SELECT last_n FROM w)
),
kept AS (
  SELECT k.*,
    ROW_NUMBER() OVER (PARTITION BY k.horse_id ORDER BY k.modelb) AS worst_rn
  FROM windowed k
),
agg AS (
SELECT k.horse_id, k.horse AS horse,
  COUNT(*)::INT AS rounds,
  SUM(k.modelb) FILTER (WHERE k.worst_rn > k.drop_n) AS rank_score,
  COUNT(*) FILTER (WHERE k.worst_rn > k.drop_n)::INT AS kept,
  (COUNT(*) >= k.min_n) AS eligible
FROM kept k
GROUP BY k.horse_id, k.horse, k.drop_n, k.min_n
),
base AS (
  SELECT *, CASE WHEN eligible
    THEN RANK() OVER (PARTITION BY eligible ORDER BY rank_score DESC) END::INT AS rank
  FROM agg
)
SELECT * FROM base;

-- ---- rider rank: last-N across all horses, drop-D worst, min-M ----
CREATE OR REPLACE VIEW modelb_rank_rider AS
WITH w AS (SELECT * FROM modelb_window('rider')),
ordered AS (
  SELECT f.*,
    ROW_NUMBER() OVER (PARTITION BY f.rider_id
      ORDER BY f.class_date DESC NULLS LAST, f.round_id) AS rn
  FROM modelb_form f, w
),
windowed AS (
  SELECT o.*, (SELECT last_n FROM w) AS last_n,
    (SELECT drop_n FROM w) AS drop_n, (SELECT min_n FROM w) AS min_n
  FROM ordered o WHERE o.rn <= (SELECT last_n FROM w)
),
kept AS (
  SELECT k.*,
    ROW_NUMBER() OVER (PARTITION BY k.rider_id ORDER BY k.modelb) AS worst_rn
  FROM windowed k
),
agg AS (
SELECT k.rider_id, k.rider AS rider,
  COUNT(*)::INT AS rounds,
  SUM(k.modelb) FILTER (WHERE k.worst_rn > k.drop_n) AS rank_score,
  COUNT(*) FILTER (WHERE k.worst_rn > k.drop_n)::INT AS kept,
  (COUNT(*) >= k.min_n) AS eligible
FROM kept k
GROUP BY k.rider_id, k.rider, k.drop_n, k.min_n
),
base AS (
  SELECT *, CASE WHEN eligible
    THEN RANK() OVER (PARTITION BY eligible ORDER BY rank_score DESC) END::INT AS rank
  FROM agg
)
SELECT * FROM base;
