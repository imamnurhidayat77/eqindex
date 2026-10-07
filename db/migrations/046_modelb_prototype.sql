-- Model B PROTOTYPE (Charles Maud, "Show Jumping Points Calculator").
-- Multiplicative per-round score for tuning BEFORE committing:
--   modelb = base(height) x perf(faults) x place(field) x field x diff x event x dc
-- Status: experimental views/functions only. Nothing reads them yet
-- (trigger/points pipeline untouched). Promote to a scoring mode only
-- after Charles locks the weightings.
--
-- Open weighting questions (see Charles's note "modify the weighting"):
--   W1  heights below 80cm are NOT in his table: prototype extends linearly
--       60->6, 70->8, 75->9 (table starts 80->10). Confirm or rescale.
--   W2  event mapping is ours: hoy->HOY 1.15; series_final /
--       national_championship / islands -> Series Finals 1.0;
--       tier Premier -> Premier 0.85; everything else -> Other 0.7.
--   W3  class-type 0.9 (Speed, Faults-into-Time) exists in his Lookups but
--       is wired into NO formula: prototype applies x1 everywhere.
--   W4  elim/retire (his 99) -> 0.05 via our status column, not faults=99.

-- ---- height base points (his table 80-160 + linear extension below 80) ----
CREATE OR REPLACE FUNCTION modelb_height_base(h NUMERIC)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN h IS NULL THEN NULL
    WHEN h >= 160 THEN 155
    WHEN h >= 155 THEN 132
    WHEN h >= 150 THEN 112
    WHEN h >= 145 THEN 95
    WHEN h >= 140 THEN 80
    WHEN h >= 135 THEN 66
    WHEN h >= 130 THEN 56
    WHEN h >= 125 THEN 47
    WHEN h >= 120 THEN 40
    WHEN h >= 115 THEN 33
    WHEN h >= 110 THEN 28
    WHEN h >= 105 THEN 24
    WHEN h >= 100 THEN 20
    WHEN h >= 95 THEN 17
    WHEN h >= 90 THEN 14
    WHEN h >= 85 THEN 12
    WHEN h >= 80 THEN 10
    WHEN h >= 60 THEN 6 + (h - 60) * 0.2   -- W1 extension
    ELSE 6
  END;
$$;

-- ---- performance multiplier from round-1 total faults ----
CREATE OR REPLACE FUNCTION modelb_perf(f NUMERIC)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN f IS NULL THEN NULL
    WHEN f <= 0 THEN 1
    WHEN f <= 1 THEN 0.9
    WHEN f <= 2 THEN 0.82
    WHEN f <= 3 THEN 0.75
    WHEN f <= 4 THEN 0.68
    WHEN f <= 5 THEN 0.6
    WHEN f <= 6 THEN 0.52
    WHEN f <= 7 THEN 0.45
    WHEN f <= 8 THEN 0.38
    WHEN f <= 9 THEN 0.33
    WHEN f <= 10 THEN 0.29
    WHEN f <= 11 THEN 0.27
    WHEN f <= 12 THEN 0.25
    WHEN f <= 13 THEN 0.22
    WHEN f <= 14 THEN 0.2
    WHEN f <= 15 THEN 0.17
    WHEN f <= 16 THEN 0.15
    ELSE 0.10                             -- his ">16 faults" row
  END;
$$;

-- ---- placing multiplier vs field size ----
CREATE OR REPLACE FUNCTION modelb_place(place INT, field INT)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN field IS NULL OR field <= 1 THEN 1.15
    WHEN place IS NULL THEN 1.0
    ELSE 1 + 0.4 * POWER(
      (field - LEAST(place, field))::NUMERIC / (field - 1), 1.2)
  END;
$$;

-- ---- field-size multiplier (log, full at 50 starters) ----
CREATE OR REPLACE FUNCTION modelb_field(field INT)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT 0.4 + 0.6 * LEAST(1, LN(GREATEST(COALESCE(field, 2), 2)) / LN(50));
$$;

-- ---- difficulty multiplier from class clear rate (0-1) ----
CREATE OR REPLACE FUNCTION modelb_diff(clear_rate NUMERIC)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT 1 + 0.5 * (0.5 - COALESCE(clear_rate, 0.5));
$$;

-- ---- event profile multiplier (W2 mapping from event_kind + tier) ----
CREATE OR REPLACE FUNCTION modelb_event(kind TEXT, tier TEXT)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN kind = 'hoy' THEN 1.15
    WHEN kind IN ('series_final', 'national_championship', 'islands') THEN 1.0
    WHEN tier = 'Premier' THEN 0.85
    ELSE 0.7
  END;
$$;

-- ---- per-round Model B score (visible classes only, like other views) ----
CREATE OR REPLACE VIEW modelb_round AS
SELECT rr.id, rr.horse_id, rr.rider_id, rr.class_id,
  COALESCE(rr.height_cm, c.height_cm)::INT AS h,
  modelb_height_base(COALESCE(rr.height_cm, c.height_cm)) AS base,
  CASE WHEN rr.status <> 'finished' THEN 0.05
    ELSE modelb_perf(rr.total_faults) END AS perf,
  modelb_place(rr.finish_place, COALESCE(c.field_size, s.starters)) AS place_m,
  modelb_field(COALESCE(c.field_size, s.starters)) AS field_m,
  modelb_diff(s.clear_rate) AS diff_m,
  modelb_event(e.event_kind, e.tier) AS event_m,
  CASE WHEN rr.clear_round
    AND ((rr.jumpoff_faults IS NOT NULL AND rr.jumpoff_faults = 0)
      OR (rr.round2_faults IS NOT NULL AND rr.round2_faults = 0))
    THEN 1.1 ELSE 1 END AS dc_m,
  ROUND(
    modelb_height_base(COALESCE(rr.height_cm, c.height_cm))
    * CASE WHEN rr.status <> 'finished' THEN 0.05
      ELSE modelb_perf(rr.total_faults) END
    * modelb_place(rr.finish_place, COALESCE(c.field_size, s.starters))
    * modelb_field(COALESCE(c.field_size, s.starters))
    * modelb_diff(s.clear_rate)
    * modelb_event(e.event_kind, e.tier)
    * CASE WHEN rr.clear_round
      AND ((rr.jumpoff_faults IS NOT NULL AND rr.jumpoff_faults = 0)
        OR (rr.round2_faults IS NOT NULL AND rr.round2_faults = 0))
      THEN 1.1 ELSE 1 END, 1) AS modelb
FROM round_results rr
JOIN classes c ON c.id = rr.class_id
JOIN events e ON e.id = rr.event_id
JOIN LATERAL (
  SELECT COUNT(*)::INT AS starters,
    AVG(x.clear_round::INT)::NUMERIC AS clear_rate
  FROM round_results x WHERE x.class_id = rr.class_id
) s ON true
WHERE class_id_visible(rr.class_id);

-- ---- standings: best 12 rounds per horse+rider combination (his sheet) ----
CREATE OR REPLACE VIEW modelb_standings AS
WITH ranked AS (
  SELECT horse_id, rider_id, modelb,
    ROW_NUMBER() OVER (PARTITION BY horse_id, rider_id ORDER BY modelb DESC) AS rn,
    COUNT(*) OVER (PARTITION BY horse_id, rider_id)::INT AS rounds
  FROM modelb_round WHERE modelb IS NOT NULL
)
SELECT r.horse_id, h.name AS horse, r.rider_id, rd.name AS rider,
  r.rounds,
  SUM(r.modelb) FILTER (WHERE r.rn <= 12) AS best12,
  ROUND(AVG(r.modelb), 1) AS avg_round,
  MAX(r.modelb) AS best_round,
  RANK() OVER (ORDER BY SUM(r.modelb) FILTER (WHERE r.rn <= 12) DESC)::INT AS rank
FROM ranked r
JOIN horses h ON h.id = r.horse_id
JOIN riders rd ON rd.id = r.rider_id
GROUP BY r.horse_id, h.name, r.rider_id, rd.name, r.rounds;

-- ---- per-horse best-12 (for comparison against horse_eqindex_rating) ----
CREATE OR REPLACE VIEW modelb_horse AS
WITH ranked AS (
  SELECT horse_id, modelb,
    ROW_NUMBER() OVER (PARTITION BY horse_id ORDER BY modelb DESC) AS rn,
    COUNT(*) OVER (PARTITION BY horse_id)::INT AS rounds
  FROM modelb_round WHERE modelb IS NOT NULL
)
SELECT r.horse_id, h.name AS horse,
  r.rounds,
  SUM(r.modelb) FILTER (WHERE r.rn <= 12) AS best12,
  ROUND(AVG(r.modelb), 1) AS avg_round,
  MAX(r.modelb) AS best_round,
  RANK() OVER (ORDER BY SUM(r.modelb) FILTER (WHERE r.rn <= 12) DESC)::INT AS rank
FROM ranked r
JOIN horses h ON h.id = r.horse_id
GROUP BY r.horse_id, h.name, r.rounds;
