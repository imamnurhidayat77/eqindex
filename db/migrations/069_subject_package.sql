-- Whole-event follow-up: subject packages (event x horse / event x rider) are
-- also always available (virtual rows, materialized at checkout). One managed
-- row per scope; manual rows (also auto=true) take precedence and are never
-- overwritten. Additive only.
CREATE UNIQUE INDEX IF NOT EXISTS packages_event_horse_auto_uidx
ON packages (event_id, horse_id)
WHERE auto IS TRUE AND horse_id IS NOT NULL AND rider_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS packages_event_rider_auto_uidx
ON packages (event_id, rider_id)
WHERE auto IS TRUE AND horse_id IS NULL AND rider_id IS NOT NULL;
