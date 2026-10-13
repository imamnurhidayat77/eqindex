-- Model B: score the completed first round of classified non-finishers.
-- Background (Oct 2026, Sophia Maud): a rider can retire IN the jump-off yet
-- keep an official placing (P2) with a valid clear first round. The old rule
-- stamped every non-finished round with elimMult (0.05) — equating a clear R1
-- + tactical retirement with never starting (1.8 pts vs ~44 for the same jumps).
-- New rule, data-grounded: a non-finished round WITH a recorded R1 time
-- scores its R1 faults via modelb_perf; without one (E/NS/WD before/at fences,
-- no time) it still takes elimMult. Finished rows unchanged.
-- Columns unchanged -> CREATE OR REPLACE is safe over dependent views.
CREATE OR REPLACE VIEW modelb_round AS
SELECT rr.id, rr.horse_id, rr.rider_id, rr.class_id,
  COALESCE(rr.height_cm, c.height_cm)::INT AS h,
  modelb_height_base(COALESCE(rr.height_cm, c.height_cm)) AS base,
  CASE WHEN rr.status <> 'finished' AND rr.time_seconds IS NULL THEN
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
    * CASE WHEN rr.status <> 'finished' AND rr.time_seconds IS NULL THEN
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
