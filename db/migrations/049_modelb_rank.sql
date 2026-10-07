-- Model B form-guide ranking (Charles sheet): horse rank = last-N rounds
-- drop-D worst (min-M to rank); rider rank = last-N across all horses.
-- Windows live in params.modelb.rankWindows (Admin -> Rating) with built-in
-- fallbacks below, so older versions without the keys keep working.

-- ---- scoring divisions reader (same source as the site: active version) ----
CREATE OR REPLACE FUNCTION active_divisions() RETURNS JSONB
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT s.params->'divisions' FROM scoring_versions s
     WHERE s.status = 'active' AND s.params ? 'divisions'
     ORDER BY s.season DESC LIMIT 1),
    '[{"key":"development","label":"Development","min":null,"max":100},
      {"key":"copper","label":"Copper","min":100,"max":120},
      {"key":"bronze","label":"Bronze","min":120,"max":130},
      {"key":"silver","label":"Silver","min":130,"max":145},
      {"key":"gold","label":"Gold","min":145,"max":null}]'::JSONB);
$$;

CREATE OR REPLACE FUNCTION division_for(h NUMERIC, divs JSONB)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT d->>'key'
  FROM jsonb_array_elements(divs) WITH ORDINALITY AS d(d, o)
  WHERE h IS NOT NULL
    AND (d->'min' IS NULL OR (d->>'min')::NUMERIC IS NULL OR h >= (d->>'min')::NUMERIC)
    AND (d->'max' IS NULL OR (d->>'max')::NUMERIC IS NULL OR h < (d->>'max')::NUMERIC)
  ORDER BY o LIMIT 1;
$$;

-- ---- rank window reader with fallbacks (horse 10/3/10, rider 20/5/20) ----
CREATE OR REPLACE FUNCTION modelb_window(kind TEXT)
RETURNS TABLE(last_n INT, drop_n INT, min_n INT)
LANGUAGE sql STABLE AS $$
  SELECT
    COALESCE((modelb_cfg()->'rankWindows'->kind->>'last')::INT,
      CASE WHEN kind = 'horse' THEN 10 ELSE 20 END),
    COALESCE((modelb_cfg()->'rankWindows'->kind->>'drop')::INT,
      CASE WHEN kind = 'horse' THEN 3 ELSE 5 END),
    COALESCE((modelb_cfg()->'rankWindows'->kind->>'min')::INT,
      CASE WHEN kind = 'horse' THEN 10 ELSE 20 END);
$$;

-- ---- round-level form guide (one row per scored round, newest first) ----
CREATE OR REPLACE VIEW modelb_form AS
SELECT m.id AS round_id, m.horse_id, h.name AS horse,
  m.rider_id, rd.name AS rider,
  c.class_date, c.name AS class_name, e.name AS event_name,
  e.event_kind, e.tier, m.h AS height_cm,
  rr.finish_place, rr.total_faults, rr.clear_round, rr.status,
  division_for(m.h::NUMERIC, active_divisions()) AS division,
  m.modelb
FROM modelb_round m
JOIN round_results rr ON rr.id = m.id
JOIN horses h ON h.id = m.horse_id
JOIN riders rd ON rd.id = m.rider_id
JOIN classes c ON c.id = m.class_id
JOIN events e ON e.id = rr.event_id;

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
    THEN RANK() OVER (ORDER BY rank_score DESC) END::INT AS rank
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
    THEN RANK() OVER (ORDER BY rank_score DESC) END::INT AS rank
  FROM agg
)
SELECT * FROM base;
