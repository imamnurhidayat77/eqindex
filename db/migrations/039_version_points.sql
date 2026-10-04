-- Full cutover to version-driven scoring (migration 039).
-- Per-round points are now computed from the ACTIVE scoring version
-- (divisions play no per-round role; best-ten/status/awards aggregate later):
--   clear? + double-clear? + placing-table(1st–5th), capped at classMax.
-- Non-finishers always score 0 (FR-14/FR-15 preserved).
-- Every write stamps points_version (NULL = legacy brief_points era).
-- With no active version the trigger falls back to the embedded v0.3
-- DEFAULTS — the same numbers as api/src/scoring/defaults.js. If Charles
-- revises v0.3, update BOTH places. Historical harmonisation is NOT done
-- here: activating a version recomputes its season (API, audited).

ALTER TABLE round_results ADD COLUMN IF NOT EXISTS points_version INT;

CREATE OR REPLACE FUNCTION round_results_score()
RETURNS TRIGGER AS $$
DECLARE
  p JSONB;
  ver INT;
  sev TEXT;
  pp JSONB;
  place_pts INT := 0;
  pts INT;
  dbl BOOLEAN;
  -- Must mirror api/src/scoring/defaults.js (v0.3). See header comment.
  def JSONB := '{"clear": 10, "doubleBonus": 5, "placing": [5, 4, 3, 2, 1], "classMax": 20}'::JSONB;
BEGIN
  -- Prefer the active version of the round's own season; fall back to the
  -- latest active version, then to embedded v0.3 defaults.
  SELECT e.season INTO sev FROM events e WHERE e.id = NEW.event_id;
  SELECT params, version INTO p, ver FROM scoring_versions
  WHERE status = 'active' AND (sev IS NULL OR season = sev)
  ORDER BY season DESC LIMIT 1;
  IF NOT FOUND THEN
    SELECT params, version INTO p, ver FROM scoring_versions
    WHERE status = 'active' ORDER BY season DESC LIMIT 1;
  END IF;
  IF NOT FOUND THEN
    p := jsonb_build_object('points', def);
    ver := NULL;
  END IF;
  pp := p->'points';
  IF NEW.status <> 'finished' OR NEW.finish_place IS NULL THEN
    NEW.points := 0;
    NEW.points_version := ver;
    RETURN NEW;
  END IF;
  dbl := NEW.clear_round
    AND ((NEW.jumpoff_faults IS NOT NULL AND NEW.jumpoff_faults = 0)
      OR (NEW.round2_faults IS NOT NULL AND NEW.round2_faults = 0));
  IF NEW.finish_place BETWEEN 1 AND 5 THEN
    place_pts := COALESCE((pp->'placing'->(NEW.finish_place - 1))::INT, 0);
  END IF;
  pts := (CASE WHEN NEW.clear_round THEN COALESCE((pp->>'clear')::INT, 0) ELSE 0 END)
       + (CASE WHEN dbl THEN COALESCE((pp->>'doubleBonus')::INT, 0) ELSE 0 END)
       + place_pts;
  NEW.points := LEAST(pts, COALESCE((pp->>'classMax')::INT, 20));
  NEW.points_version := ver;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS round_results_points_trg ON round_results;
CREATE TRIGGER round_results_points_trg
  BEFORE INSERT OR UPDATE OF finish_place, status, class_id ON round_results
  FOR EACH ROW EXECUTE FUNCTION round_results_score();
