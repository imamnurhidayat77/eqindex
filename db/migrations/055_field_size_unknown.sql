-- Field-size unknown-vs-zero — migration 055.
-- Root cause of halved Model B scores (Oct 2026): classes.field_size
-- defaulted to 0 (001: NOT NULL DEFAULT 0) and no importer ever set it,
-- while modelb views used COALESCE(c.field_size, s.starters) — which only
-- rescues NULL, so 0 flowed through as "a field of zero": flat 1.15 place
-- bonus (placings flattened!) and ~0.5 field multiplier.
-- Fix on every layer:
--   1. views treat 0 as unknown -> fall back to actual starter count;
--   2. column allows NULL, default NULL (unknown, not zero);
--   3. leftover 0s on round-less classes -> NULL.

-- 1. live view: 0 means unknown (4 spots)
CREATE OR REPLACE VIEW modelb_round AS
SELECT rr.id, rr.horse_id, rr.rider_id, rr.class_id,
  COALESCE(rr.height_cm, c.height_cm)::INT AS h,
  modelb_height_base(COALESCE(rr.height_cm, c.height_cm)) AS base,
  CASE WHEN rr.status <> 'finished' THEN
      COALESCE((modelb_cfg()->>'elimMult')::NUMERIC, 0.05)
    ELSE modelb_perf(rr.total_faults) END AS perf,
  modelb_place(rr.finish_place, COALESCE(NULLIF(c.field_size, 0), s.starters)) AS place_m,
  modelb_field(COALESCE(NULLIF(c.field_size, 0), s.starters)) AS field_m,
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
    * modelb_place(rr.finish_place, COALESCE(NULLIF(c.field_size, 0), s.starters))
    * modelb_field(COALESCE(NULLIF(c.field_size, 0), s.starters))
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

-- 2. unknown, not zero
UPDATE classes SET field_size = NULL
  WHERE field_size = 0
    AND NOT EXISTS (SELECT 1 FROM round_results rr WHERE rr.class_id = classes.id);
ALTER TABLE classes ALTER COLUMN field_size DROP NOT NULL;
ALTER TABLE classes ALTER COLUMN field_size SET DEFAULT NULL;
