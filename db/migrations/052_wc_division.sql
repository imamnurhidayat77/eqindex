-- 052: World Cup division (Charles sheet column D C B S G WC).
-- WC is class-based, not height-based: a round counts as World Cup when its
-- class is flagged is_world_cup (Admin → Classes, or import column
-- is_world_cup / world_cup / wc). Takes precedence over height bands,
-- mirroring api/src/scoring/calc.js divisionFor(h, isWC).
-- Idempotent: safe to re-run.

-- 1. v8 scoring version: clone of the active version + WC division entry.
INSERT INTO scoring_versions (season, version, status, label, params, activated_at)
SELECT s.season, (SELECT COALESCE(MAX(version), 0) + 1 FROM scoring_versions WHERE season = s.season),
  'draft', 'Series scales + World Cup division',
  jsonb_set(
    s.params, '{divisions}',
    (s.params->'divisions') || '[{"key":"world_cup","label":"World Cup","min":null,"max":null,"color":"#8E7CFF"}]'::JSONB
  ),
  NULL
FROM scoring_versions s
WHERE s.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM scoring_versions d, LATERAL jsonb_array_elements(d.params->'divisions') div
    WHERE d.season = s.season AND d.version > s.version AND div->>'key' = 'world_cup'
  )
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(s.params->'divisions') div WHERE div->>'key' = 'world_cup'
  );

-- 2. Activate the WC draft (archive the previous active), same semantics as
-- POST /admin/scoring/versions/:id/activate (points untouched: divisions
-- are display-only; per-round points do not depend on them).
UPDATE scoring_versions SET status = 'archived'
WHERE id IN (
  SELECT a.id FROM scoring_versions a
  JOIN scoring_versions d ON d.season = a.season
    AND d.label = 'Series scales + World Cup division' AND d.status = 'draft'
  WHERE a.status = 'active'
);
UPDATE scoring_versions SET status = 'active', activated_at = NOW()
WHERE label = 'Series scales + World Cup division' AND status = 'draft';

INSERT INTO entity_audit (actor, action, entity_type, entity_id, detail)
SELECT 'migration 052', 'scoring.activate', 'scoring', id,
  jsonb_build_object('label', label, 'note', 'World Cup division added')
FROM scoring_versions
WHERE label = 'Series scales + World Cup division' AND status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM entity_audit e
    WHERE e.action = 'scoring.activate' AND e.entity_id = scoring_versions.id::TEXT
  );

-- 3. Form-guide division: WC flag wins over height bands.
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
      {"key":"gold","label":"Gold","min":145,"max":null},
      {"key":"world_cup","label":"World Cup","min":null,"max":null}]'::JSONB);
$$;

CREATE OR REPLACE VIEW modelb_form AS
SELECT m.id AS round_id, m.horse_id, h.name AS horse,
  m.rider_id, rd.name AS rider,
  c.class_date, c.name AS class_name, e.name AS event_name,
  e.event_kind, e.tier, m.h AS height_cm,
  rr.finish_place, rr.total_faults, rr.clear_round, rr.status,
  CASE WHEN c.is_world_cup THEN 'world_cup'
    ELSE division_for(m.h::NUMERIC, active_divisions()) END AS division,
  m.modelb
FROM modelb_round m
JOIN round_results rr ON rr.id = m.id
JOIN horses h ON h.id = m.horse_id
JOIN riders rd ON rd.id = m.rider_id
JOIN classes c ON c.id = m.class_id
JOIN events e ON e.id = rr.event_id;
