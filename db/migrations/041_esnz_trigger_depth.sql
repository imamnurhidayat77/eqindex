-- Fix-forward for 040 (same-day): BEFORE trigger must not clobber values
-- written by esnz_recalc_class_with() itself.
-- Problem: the batch UPDATE inside esnz_recalc_class_with() re-fires the
-- BEFORE trigger, which would overwrite the freshly computed points
-- (legacy path) or version stamp handling.
-- Fix: nested writes (pg_trigger_depth() > 1, i.e. writes issued from
-- inside a trigger/recalc call) pass through untouched — the recalc
-- statement already sets both points and points_version explicitly.
-- Top-level writes (depth = 1) behave exactly as in 040.

CREATE OR REPLACE FUNCTION round_results_score() RETURNS TRIGGER AS $$
DECLARE ver INT; pmode TEXT; sev TEXT; ct TEXT;
BEGIN
  -- Nested write from esnz_recalc_class_with(): values already final.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  SELECT e.season INTO sev FROM events e
    WHERE e.id = COALESCE(NEW.event_id, OLD.event_id);
  SELECT s.version, (s.params->>'mode') INTO ver, pmode
    FROM scoring_versions s
    WHERE s.status = 'active'
    ORDER BY (s.season = sev) DESC, s.season DESC LIMIT 1;
  NEW.points_version := ver;
  IF pmode = 'esnz' THEN
    -- placeholder; AFTER trigger recalculates the whole class (shares).
    -- On INSERT the placeholder is 0; recalc fills the real value.
    IF TG_OP = 'INSERT' THEN
      NEW.points := 0;
    END IF;
    -- On UPDATE leave points stale; AFTER recalc corrects the class.
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
