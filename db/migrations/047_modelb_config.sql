-- Model B weights move into scoring_versions.params->'modelb' (editable
-- in Admin -> Scoring, new "Model B" tab). DB functions read the active
-- version; built-in default = Charles's sheet values (046 prototype).
-- classTypeMult is now WIRED (was an unwired table in his sheet): no class
-- in the DB currently uses those formats, so live scores are unchanged.
-- Standings best-N also comes from config (was hardcoded 12).

-- ---- config reader: active version's modelb, else built-in default ----
CREATE OR REPLACE FUNCTION modelb_cfg() RETURNS JSONB
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT s.params->'modelb' FROM scoring_versions s
     WHERE s.status = 'active' AND s.params ? 'modelb'
     ORDER BY s.season DESC LIMIT 1),
    '{"heightBase": [[80,10],[85,12],[90,14],[95,17],[100,20],[105,24],[110,28],[115,33],[120,40],[125,47],[130,56],[135,66],[140,80],[145,95],[150,112],[155,132],[160,155]],
      "lowHeight": {"fromCm": 60, "base": 6, "perCm": 0.2},
      "faults": {"0":1,"1":0.9,"2":0.82,"3":0.75,"4":0.68,"5":0.6,"6":0.52,"7":0.45,"8":0.38,"9":0.33,"10":0.29,"11":0.27,"12":0.25,"13":0.22,"14":0.2,"15":0.17,"16":0.15,"over16":0.10},
      "elimMult": 0.05,
      "placeK": 0.4, "placeExp": 1.2, "fieldMinBonus": 1.15,
      "fieldBase": 0.4, "fieldFull": 50,
      "diffK": 0.5,
      "eventProfiles": {"HOY": ["hoy"], "Finals": ["series_final", "national_championship", "islands"], "PremierTiers": ["Premier"]},
      "eventMult": {"HOY": 1.15, "Finals": 1.0, "Premier": 0.85, "Other": 0.7},
      "dcBonus": 1.1,
      "classTypeMult": {"Speed": 0.9, "Faults into Time": 0.9},
      "bestN": 12,
      "rankWindows": {"horse": {"last": 10, "drop": 3, "min": 10}, "rider": {"last": 20, "drop": 5, "min": 20}}}'::JSONB);
$$;

CREATE OR REPLACE FUNCTION modelb_height_base(h NUMERIC)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN h IS NULL THEN NULL
    ELSE COALESCE(
      (SELECT (e->>1)::NUMERIC
       FROM jsonb_array_elements((SELECT modelb_cfg()->'heightBase')) e
       WHERE (e->>0)::NUMERIC <= h
       ORDER BY (e->>0)::NUMERIC DESC LIMIT 1),
      (modelb_cfg()->'lowHeight'->>'base')::NUMERIC
        + (h - (modelb_cfg()->'lowHeight'->>'fromCm')::NUMERIC)
        * (modelb_cfg()->'lowHeight'->>'perCm')::NUMERIC)
  END;
$$;

CREATE OR REPLACE FUNCTION modelb_perf(f NUMERIC)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN f IS NULL THEN NULL
    ELSE (SELECT (modelb_cfg()->'faults'
      ->> CASE WHEN f <= 16 THEN GREATEST(f, 0)::INT::TEXT ELSE 'over16' END)::NUMERIC)
  END;
$$;

CREATE OR REPLACE FUNCTION modelb_place(place INT, field INT)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN field IS NULL OR field <= 1
      THEN COALESCE((modelb_cfg()->>'fieldMinBonus')::NUMERIC, 1.15)
    WHEN place IS NULL THEN 1.0
    ELSE 1 + (modelb_cfg()->>'placeK')::NUMERIC * POWER(
      (field - LEAST(place, field))::NUMERIC / (field - 1),
      (modelb_cfg()->>'placeExp')::NUMERIC)
  END;
$$;

CREATE OR REPLACE FUNCTION modelb_field(field INT)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT (fb.base + (1 - fb.base)
      * LEAST(1, LN(GREATEST(COALESCE(field, 2), 2)) / LN(fb.full)))
  FROM (SELECT COALESCE((modelb_cfg()->>'fieldBase')::NUMERIC, 0.4) AS base,
               COALESCE((modelb_cfg()->>'fieldFull')::NUMERIC, 50) AS full) fb;
$$;

CREATE OR REPLACE FUNCTION modelb_diff(clear_rate NUMERIC)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT 1 + COALESCE((modelb_cfg()->>'diffK')::NUMERIC, 0.5)
    * (0.5 - COALESCE(clear_rate, 0.5));
$$;

CREATE OR REPLACE FUNCTION modelb_event(kind TEXT, tier TEXT)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN kind = ANY (SELECT jsonb_array_elements_text(
      (SELECT modelb_cfg()->'eventProfiles'->'HOY')))
      THEN ((SELECT modelb_cfg()->'eventMult'->>'HOY')::NUMERIC)
    WHEN kind = ANY (SELECT jsonb_array_elements_text(
      (SELECT modelb_cfg()->'eventProfiles'->'Finals')))
      THEN ((SELECT modelb_cfg()->'eventMult'->>'Finals')::NUMERIC)
    WHEN tier = ANY (SELECT jsonb_array_elements_text(
      (SELECT modelb_cfg()->'eventProfiles'->'PremierTiers')))
      THEN ((SELECT modelb_cfg()->'eventMult'->>'Premier')::NUMERIC)
    ELSE ((SELECT modelb_cfg()->'eventMult'->>'Other')::NUMERIC)
  END;
$$;

CREATE OR REPLACE FUNCTION modelb_class_mult(fmt TEXT)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT COALESCE((modelb_cfg()->'classTypeMult'->>fmt)::NUMERIC, 1);
$$;

-- ---- per-round score gains the (currently neutral) class factor ----
-- (DROP+CREATE: column added, which OR REPLACE forbids.)
DROP VIEW IF EXISTS modelb_standings;
DROP VIEW IF EXISTS modelb_horse;
DROP VIEW IF EXISTS modelb_round;
CREATE VIEW modelb_round AS
SELECT rr.id, rr.horse_id, rr.rider_id, rr.class_id,
  COALESCE(rr.height_cm, c.height_cm)::INT AS h,
  modelb_height_base(COALESCE(rr.height_cm, c.height_cm)) AS base,
  CASE WHEN rr.status <> 'finished' THEN
      COALESCE((modelb_cfg()->>'elimMult')::NUMERIC, 0.05)
    ELSE modelb_perf(rr.total_faults) END AS perf,
  modelb_place(rr.finish_place, COALESCE(c.field_size, s.starters)) AS place_m,
  modelb_field(COALESCE(c.field_size, s.starters)) AS field_m,
  modelb_diff(s.clear_rate) AS diff_m,
  modelb_event(e.event_kind, e.tier) AS event_m,
  modelb_class_mult(c.format) AS class_m,
  CASE WHEN rr.clear_round
    AND ((rr.jumpoff_faults IS NOT NULL AND rr.jumpoff_faults = 0)
      OR (rr.round2_faults IS NOT NULL AND rr.round2_faults = 0))
    THEN COALESCE((modelb_cfg()->>'dcBonus')::NUMERIC, 1.1) ELSE 1 END AS dc_m,
  ROUND(
    modelb_height_base(COALESCE(rr.height_cm, c.height_cm))
    * CASE WHEN rr.status <> 'finished' THEN
        COALESCE((modelb_cfg()->>'elimMult')::NUMERIC, 0.05)
      ELSE modelb_perf(rr.total_faults) END
    * modelb_place(rr.finish_place, COALESCE(c.field_size, s.starters))
    * modelb_field(COALESCE(c.field_size, s.starters))
    * modelb_diff(s.clear_rate)
    * modelb_event(e.event_kind, e.tier)
    * modelb_class_mult(c.format)
    * CASE WHEN rr.clear_round
      AND ((rr.jumpoff_faults IS NOT NULL AND rr.jumpoff_faults = 0)
        OR (rr.round2_faults IS NOT NULL AND rr.round2_faults = 0))
      THEN COALESCE((modelb_cfg()->>'dcBonus')::NUMERIC, 1.1) ELSE 1 END, 1) AS modelb
FROM round_results rr
JOIN classes c ON c.id = rr.class_id
JOIN events e ON e.id = rr.event_id
JOIN LATERAL (
  SELECT COUNT(*)::INT AS starters,
    AVG(x.clear_round::INT)::NUMERIC AS clear_rate
  FROM round_results x WHERE x.class_id = rr.class_id
) s ON true
WHERE class_id_visible(rr.class_id);

-- ---- standings best-N now follows config (was hardcoded 12) ----
CREATE OR REPLACE VIEW modelb_standings AS
WITH ranked AS (
  SELECT horse_id, rider_id, modelb,
    ROW_NUMBER() OVER (PARTITION BY horse_id, rider_id ORDER BY modelb DESC) AS rn,
    COUNT(*) OVER (PARTITION BY horse_id, rider_id)::INT AS rounds
  FROM modelb_round WHERE modelb IS NOT NULL
)
SELECT r.horse_id, h.name AS horse, r.rider_id, rd.name AS rider,
  r.rounds,
  SUM(r.modelb) FILTER (WHERE r.rn <= COALESCE((modelb_cfg()->>'bestN')::INT, 12)) AS best12,
  ROUND(AVG(r.modelb), 1) AS avg_round,
  MAX(r.modelb) AS best_round,
  RANK() OVER (ORDER BY SUM(r.modelb)
    FILTER (WHERE r.rn <= COALESCE((modelb_cfg()->>'bestN')::INT, 12)) DESC)::INT AS rank
FROM ranked r
JOIN horses h ON h.id = r.horse_id
JOIN riders rd ON rd.id = r.rider_id
GROUP BY r.horse_id, h.name, r.rider_id, rd.name, r.rounds;

CREATE OR REPLACE VIEW modelb_horse AS
WITH ranked AS (
  SELECT horse_id, modelb,
    ROW_NUMBER() OVER (PARTITION BY horse_id ORDER BY modelb DESC) AS rn,
    COUNT(*) OVER (PARTITION BY horse_id)::INT AS rounds
  FROM modelb_round WHERE modelb IS NOT NULL
)
SELECT r.horse_id, h.name AS horse,
  r.rounds,
  SUM(r.modelb) FILTER (WHERE r.rn <= COALESCE((modelb_cfg()->>'bestN')::INT, 12)) AS best12,
  ROUND(AVG(r.modelb), 1) AS avg_round,
  MAX(r.modelb) AS best_round,
  RANK() OVER (ORDER BY SUM(r.modelb)
    FILTER (WHERE r.rn <= COALESCE((modelb_cfg()->>'bestN')::INT, 12)) DESC)::INT AS rank
FROM ranked r
JOIN horses h ON h.id = r.horse_id
GROUP BY r.horse_id, h.name, r.rounds;
