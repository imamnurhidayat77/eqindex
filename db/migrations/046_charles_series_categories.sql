-- 046: Charles series categories (Oct 2026).
--   - Split generic young-horse-series classes into age keys (5/6/7YO).
--   - Register premier-league-series + age keys in series_info.
--   - Rename display labels: Horse Grand Prix, Pro Amateur Rider.
--   - Drop the empty legacy young-horse-series registry row.
-- Idempotent: safe to re-run (guards on current values).

UPDATE classes SET series_key = 'five-yo-series'
WHERE series_key = 'young-horse-series' AND name ILIKE '%5 year old%';

UPDATE classes SET series_key = 'six-yo-series'
WHERE series_key = 'young-horse-series' AND name ILIKE '%6 year old%';

UPDATE classes SET series_key = 'seven-yo-series'
WHERE series_key = 'young-horse-series' AND name ILIKE '%7 year old%';

INSERT INTO series_info (series_key, display_name, auto_calc) VALUES
  ('premier-league-series', 'Premier League Series', true),
  ('five-yo-series', 'Five-Year-Old Young Horse Series', true),
  ('six-yo-series', 'Six-Year-Old Young Horse Series', true),
  ('seven-yo-series', 'Seven-Year-Old Young Horse Series', true)
ON CONFLICT (series_key) DO UPDATE SET display_name = EXCLUDED.display_name;

UPDATE series_info SET display_name = 'Horse Grand Prix Series'
WHERE series_key = 'grand-prix-series';

UPDATE series_info SET display_name = 'Pro Amateur Rider Series'
WHERE series_key = 'pro-am-series';

DELETE FROM series_info WHERE series_key = 'young-horse-series'
  AND NOT EXISTS (SELECT 1 FROM classes c WHERE c.series_key = 'young-horse-series');

-- Refresh stored points for retagged classes (no trigger fires on classes update).
SELECT esnz_recalc_class(c.id) FROM classes c
WHERE c.series_key IN ('five-yo-series', 'six-yo-series', 'seven-yo-series');
