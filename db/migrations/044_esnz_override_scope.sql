-- ESNZ refinement — migration 044.
-- Rulebook finding (HGP §4.2): "The Grand Prix Championship CLASS at the NZ
-- Championships, Series Final and HOY will receive Premier League points" —
-- the Premier switch applies to the designated championship class only,
-- not every GP class at those events. Our 040 override was event-wide.
-- Fix: scaleOverride entries accept optional "classNameContains": [...]
-- (case-insensitive substring match on classes.name). Entries without it
-- keep the old event-wide behavior (e.g. Amateur finals).

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
  skey TEXT; cname TEXT; cfg JSONB;
  scale_name TEXT; mult NUMERIC := 1;
  sc_arr JSONB; use_arr JSONB;
  mo JSONB; so JSONB;
  clear_on BOOLEAN;
BEGIN
  SELECT c.series_key, c.name INTO skey, cname FROM classes c WHERE c.id = cid;
  cfg := ez->'series'->COALESCE(skey, '');

  -- scale resolution
  scale_name := COALESCE(cfg->>'scale', 'show_rating');
  IF scale_name = 'show_rating' THEN
    scale_name := CASE WHEN tier_v = 'Premier' THEN 'premier' ELSE defscale END;
  END IF;
  IF cfg ? 'scaleOverride' THEN
    FOR so IN SELECT * FROM jsonb_array_elements(cfg->'scaleOverride') LOOP
      IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(so->'eventKinds') k WHERE k = kind_v)
        AND (
          NOT (so ? 'classNameContains')
          OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(so->'classNameContains') pat
                     WHERE cname ILIKE '%' || pat || '%')
        ) THEN
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
