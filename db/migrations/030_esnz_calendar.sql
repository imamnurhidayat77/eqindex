-- EQIndex ESNZ 2026-27 calendar support — migration 030
-- 1. events.is_active: backend on/off switch per show (Charles).
--    Inactive shows are hidden from public lists/detail and reject new results.
-- 2. events.tier: ESNZ calendar tier (Grand Prix / Premier / No Series).
-- 3. events.series_flags: SJ series offered at the show, as codes
--    (WC,PL,HGP,PGP,YR,T,J,AR,PA,7YO,6YO,5YO). Show Hunter flags (NS,EQ)
--    are out of scope and never stored.
-- 4. Tertiary rider category (ESNZ "T" column).

ALTER TABLE events ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS tier TEXT
  CHECK (tier IS NULL OR tier IN ('Grand Prix','Premier','No Series'));
ALTER TABLE events ADD COLUMN IF NOT EXISTS series_flags TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE riders DROP CONSTRAINT IF EXISTS riders_series_category_check;
ALTER TABLE riders ADD CONSTRAINT riders_series_category_check
  CHECK (series_category IS NULL OR series_category IN
    ('Junior','Young Rider','Under 25','Amateur','Pony','Tertiary','Open'));

CREATE INDEX IF NOT EXISTS events_active_date_idx ON events (is_active, date_start DESC);
