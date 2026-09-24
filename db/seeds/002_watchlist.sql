-- Seed demo watches for the My Watchlist showcase (run once by hand).
-- Requires users/horses/riders/events from earlier seeds. Safe to re-run.

WITH u AS (SELECT id FROM users WHERE email = 'admin@eqindex.local'),
kh AS (SELECT id FROM horses WHERE normalized_name = 'KIWI SPIRIT'),
sr AS (SELECT id FROM riders WHERE normalized_name = 'SOPHIE BENNETT'),
ev AS (SELECT id FROM events WHERE name = 'Season Final' AND season = '2026-2027')
INSERT INTO watchlist_items (user_id, entity_type, horse_id, rider_id, note)
SELECT u.id, 'combination', kh.id, sr.id, 'Rankings mockup spotlight' FROM u, kh, sr
ON CONFLICT DO NOTHING;

WITH u AS (SELECT id FROM users WHERE email = 'admin@eqindex.local'),
ev AS (SELECT id FROM events WHERE name = 'Season Final' AND season = '2026-2027')
INSERT INTO watchlist_items (user_id, entity_type, entity_id)
SELECT u.id, 'event', ev.id FROM u, ev
ON CONFLICT DO NOTHING;
