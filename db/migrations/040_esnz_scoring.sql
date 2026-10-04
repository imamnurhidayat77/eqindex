-- EQIndex ESNZ official scoring — migration 040.
-- Implements ESNZ Show Jumping Rules 2026 v19.0 Annex 11 (Jumping Series
-- Conditions) as a DYNAMIC ruleset: every number lives in
-- scoring_versions.params with mode='esnz'. No hardcoded scales.
--   params.esnz = {
--     scope: 'series_only' | 'all_classes'  (strict Charles vs pragmatic;
--       admin toggle, default series_only),
--     scales: { grand_prix: [...], premier: [...] },
--     placesCounted, zeroFaultThreshold (null = off),
--     shareEqualPlacings (bool),
--     defaultScale: 'grand_prix',
--     youngHorse: { enabled, seriesKeys: [...], firstClear, doubleClearTotal },
--     majorKinds: [event_kind values treated as championship majors],
--     series: { <series_key>: {
--       bestOf | sliding: [[held,count],...],
--       scale: 'show_rating' | 'grand_prix' | 'premier' | 'none',
--       majorScale, clearRound (bool),
--       scaleOverride: [{eventKinds:[...], scale}],
--       multipliers: [{eventKinds:[...], mult}],
--       sources: [<series_key>, ...] } }
--   }
-- Mechanics:
--   BEFORE trigger stamps points_version (+ legacy brief_points when no
--   esnz version is active). AFTER trigger (depth-guarded) recalculates
--   the WHOLE class via esnz_recalc_class() so equal-placing shares see
--   all siblings. Batch recompute (activate/preview) calls the SAME
--   function per class: single source of truth, zero trigger/JS drift.
-- Supersedes 039_version_points.sql (never applied live): points_version
-- column is added here instead.

-- ---- 1. columns ----
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_kind TEXT NOT NULL DEFAULT 'regular'
  CHECK (event_kind IN ('regular','national_championship','series_final','islands','hoy','national_young_horse'));
ALTER TABLE round_results ADD COLUMN IF NOT EXISTS points_version INT;

-- ---- 2. whole-class recalculation (single source of truth) ----
CREATE OR REPLACE FUNCTION esnz_recalc_class(cid UUID) RETURNS VOID AS $$
DECLARE
  p JSONB; ver INT; season_v TEXT;
  tier_v TEXT; kind_v TEXT;
BEGIN
  SELECT e.tier, e.event_kind, e.season INTO tier_v, kind_v, season_v
    FROM classes c JOIN events e ON e.id = c.event_id WHERE c.id = cid;
  IF NOT FOUND THEN RETURN; END IF;

  -- active esnz params, preferring the round's own season
  SELECT s.params, s.version INTO p, ver
    FROM scoring_versions s
    WHERE s.status = 'active' AND (s.params->>'mode') = 'esnz'
    ORDER BY (s.season = season_v) DESC, s.season DESC LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  PERFORM esnz_recalc_class_with(cid, p, ver, tier_v, kind_v);
END;
$$ LANGUAGE plpgsql;

-- Core computation with explicit params (also used by txn-preview).
CREATE OR REPLACE FUNCTION esnz_recalc_class_with(cid UUID, p JSONB, ver INT, tier_v TEXT, kind_v TEXT)
RETURNS VOID AS $$
DECLARE
  ez JSONB := COALESCE(p->'esnz', '{}');
  scope TEXT := COALESCE(ez->>'scope', 'series_only');
  places INT := COALESCE((ez->>'placesCounted')::INT, 6);
  threshold NUMERIC := (ez->>'zeroFaultThreshold')::NUMERIC;
  share BOOLEAN := COALESCE((ez->>'shareEqualPlacings')::BOOLEAN, TRUE);
  defscale TEXT := COALESCE(ez->>'defaultScale', 'grand_prix');
  yh JSONB := COALESCE(ez->'youngHorse', '{}');
  yh_on BOOLEAN := COALESCE((yh->>'enabled')::BOOLEAN, TRUE);
  yh_keys TEXT[] := COALESCE(ARRAY(SELECT jsonb_array_elements_text(yh->'seriesKeys')), ARRAY[]::TEXT[]);
  yh_first INT := COALESCE((yh->>'firstClear')::INT, 4);
  yh_double INT := COALESCE((yh->>'doubleClearTotal')::INT, 6);
  majors TEXT[] := COALESCE(ARRAY(SELECT jsonb_array_elements_text(ez->'majorKinds')),
    ARRAY['national_championship','series_final','islands','hoy','national_young_horse']);
  is_major BOOLEAN := kind_v = ANY(majors);
  skey TEXT; cfg JSONB;
  scale_name TEXT; mult NUMERIC := 1;
  sc_arr JSONB; use_arr JSONB;
  mo JSONB; so JSONB;
  clear_on BOOLEAN;
BEGIN
  SELECT c.series_key INTO skey FROM classes c WHERE c.id = cid;
  cfg := ez->'series'->COALESCE(skey, '');

  -- scale resolution
  scale_name := COALESCE(cfg->>'scale', 'show_rating');
  IF scale_name = 'show_rating' THEN
    scale_name := CASE WHEN tier_v = 'Premier' THEN 'premier' ELSE defscale END;
  END IF;
  IF cfg ? 'scaleOverride' THEN
    FOR so IN SELECT * FROM jsonb_array_elements(cfg->'scaleOverride') LOOP
      IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(so->'eventKinds') k WHERE k = kind_v) THEN
        scale_name := so->>'scale'; EXIT;
      END IF;
    END LOOP;
  END IF;
  IF scale_name IN ('grand_prix', 'premier') THEN
    use_arr := ez->'scales'->scale_name;
  ELSIF is_major AND cfg ? 'majorScale' AND (cfg->>'majorScale') IN ('grand_prix', 'premier') THEN
    -- e.g. young-horse at championship majors: placing per majorScale
    use_arr := ez->'scales'->(cfg->>'majorScale');
  ELSE
    use_arr := NULL; -- clear-only class
  END IF;
  -- multipliers (e.g. PL 2.0 nationals, 1.5 final/HOY)
  IF cfg ? 'multipliers' THEN
    FOR mo IN SELECT * FROM jsonb_array_elements(cfg->'multipliers') LOOP
      IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(mo->'eventKinds') k WHERE k = kind_v) THEN
        mult := COALESCE((mo->>'mult')::NUMERIC, 1); EXIT;
      END IF;
    END LOOP;
  END IF;
  clear_on := yh_on AND (skey = ANY(yh_keys) OR COALESCE((cfg->>'clearRound')::BOOLEAN, FALSE));

  WITH base AS (
    SELECT rr.id, rr.finish_place,
      (rr.status <> 'finished' OR rr.finish_place IS NULL OR rr.finish_place > places
        OR (threshold IS NOT NULL AND rr.total_faults IS NOT NULL AND rr.total_faults >= threshold)
        OR (skey IS NULL AND scope = 'series_only')) AS is_out,
      CASE WHEN rr.clear_round AND clear_on THEN
        CASE WHEN (rr.jumpoff_faults IS NOT NULL AND rr.jumpoff_faults = 0)
              OR (rr.round2_faults IS NOT NULL AND rr.round2_faults = 0)
          THEN yh_double ELSE yh_first END
      ELSE 0 END AS clear_pts,
      CASE WHEN use_arr IS NOT NULL AND rr.finish_place BETWEEN 1 AND places
        THEN COALESCE((use_arr->>(rr.finish_place - 1))::NUMERIC, 0) ELSE 0 END AS place_val
    FROM round_results rr WHERE rr.class_id = cid
  ),
  ties AS (
    SELECT finish_place AS fp, COUNT(*)::INT AS k
    FROM base WHERE NOT is_out AND finish_place IS NOT NULL
    GROUP BY 1
  ),
  pools AS (
    SELECT t.fp, t.k,
      COALESCE((
        SELECT SUM(COALESCE((use_arr->>(g.i - 1))::NUMERIC, 0))
        FROM generate_series(t.fp, t.fp + t.k - 1) AS g(i)
      ), 0) AS pool
    FROM ties t
  ),
  shared AS (
    SELECT fp, FLOOR(pool / k + 0.5) AS val FROM pools WHERE k > 0
  )
  UPDATE round_results rr SET
    points = CASE WHEN b.is_out THEN 0 ELSE
      FLOOR(COALESCE(CASE WHEN share THEN sh.val END, b.place_val) * mult + 0.5)::INT
      + b.clear_pts END,
    points_version = ver
  FROM base b
  LEFT JOIN shared sh ON sh.fp = b.finish_place
  WHERE rr.id = b.id;
END;
$$ LANGUAGE plpgsql;

-- ---- 3. triggers ----
CREATE OR REPLACE FUNCTION round_results_score() RETURNS TRIGGER AS $$
DECLARE ver INT; pmode TEXT; sev TEXT; ct TEXT;
BEGIN
  SELECT e.season INTO sev FROM events e
    WHERE e.id = COALESCE(NEW.event_id, OLD.event_id);
  SELECT s.version, (s.params->>'mode') INTO ver, pmode
    FROM scoring_versions s
    WHERE s.status = 'active'
    ORDER BY (s.season = sev) DESC, s.season DESC LIMIT 1;
  NEW.points_version := ver;
  IF pmode = 'esnz' THEN
    -- placeholder; AFTER trigger recalculates the whole class (shares)
    NEW.points := 0;
  ELSE
    -- legacy brief_points path (008), unchanged
    IF NEW.status <> 'finished' OR NEW.finish_place IS NULL THEN
      NEW.points := 0;
    ELSE
      SELECT class_type INTO ct FROM classes WHERE id = NEW.class_id;
      NEW.points := brief_points(NEW.finish_place, COALESCE(ct, 'Standard'));
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS round_results_points_trg ON round_results;
CREATE TRIGGER round_results_points_trg
BEFORE INSERT OR UPDATE OF finish_place, status, class_id, event_id,
  total_faults, clear_round, jumpoff_faults, round2_faults
ON round_results FOR EACH ROW EXECUTE FUNCTION round_results_score();

CREATE OR REPLACE FUNCTION round_results_esnz_after() RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM esnz_recalc_class(OLD.class_id);
    RETURN OLD;
  END IF;
  PERFORM esnz_recalc_class(NEW.class_id);
  IF (TG_OP = 'UPDATE' AND OLD.class_id IS DISTINCT FROM NEW.class_id) THEN
    PERFORM esnz_recalc_class(OLD.class_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS round_results_esnz_share_trg ON round_results;
CREATE TRIGGER round_results_esnz_share_trg
AFTER INSERT OR UPDATE OF finish_place, status, class_id, event_id,
  total_faults, clear_round, jumpoff_faults, round2_faults
ON round_results FOR EACH ROW
WHEN (pg_trigger_depth() = 0)
EXECUTE FUNCTION round_results_esnz_after();

DROP TRIGGER IF EXISTS round_results_esnz_share_del_trg ON round_results;
CREATE TRIGGER round_results_esnz_share_del_trg
AFTER DELETE ON round_results FOR EACH ROW
WHEN (pg_trigger_depth() = 0)
EXECUTE FUNCTION round_results_esnz_after();
