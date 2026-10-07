-- 049: drop "ESNZ official" claims from scoring version labels.
-- Our points are EQIndex-calculated, not ESNZ-published (Oct 2026).
-- Idempotent: only rewrites the known legacy labels.

UPDATE scoring_versions SET label = 'Series scales + rulebook refinements'
WHERE version = 7 AND label = 'ESNZ official + rulebook refinements';

UPDATE scoring_versions SET label = 'Series scales + divisions'
WHERE version = 5 AND label = 'ESNZ official + divisions';

UPDATE scoring_versions SET label = '2026-27 series rules (Annex 11 v19.0)'
WHERE version = 3 AND label = 'ESNZ 2026-27 official (Annex 11 v19.0)';
