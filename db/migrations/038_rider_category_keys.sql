-- Rider category keys as the single vocabulary (migration 038).
-- rider_categories (Admin → Categories, migration 037) is the master: every
-- category option list (rider edit, class edit, rankings filters) comes from
-- it, and riders.series_category / classes.rider_category store the master
-- KEY. This migration:
-- 1. Drops the closed CHECK on riders.series_category (the master table is
--    admin-editable, so no fixed list may be enforced here; the API validates
--    against master keys instead).
-- 2. Backfills legacy label values to keys (case-insensitive). Values with no
--    fitting bucket (Under 25, Tertiary, Open) are left untouched for the
--    admin to remap (or to cover with a new bucket in Admin → Categories).
-- Additive only; re-runnable.

ALTER TABLE riders DROP CONSTRAINT IF EXISTS riders_series_category_check;

UPDATE riders SET series_category = 'young' WHERE LOWER(series_category) = 'young rider';
UPDATE riders SET series_category = 'junior' WHERE LOWER(series_category) IN ('junior', 'junior rider');
UPDATE riders SET series_category = 'amateur' WHERE LOWER(series_category) = 'amateur';
UPDATE riders SET series_category = 'pony' WHERE LOWER(series_category) IN ('pony', 'pony rider');
UPDATE riders SET series_category = 'pro' WHERE LOWER(series_category) IN ('pro', 'pro rider');

UPDATE classes SET rider_category = 'pony' WHERE LOWER(rider_category) IN ('pony', 'pony rider');
UPDATE classes SET rider_category = 'junior' WHERE LOWER(rider_category) IN ('junior', 'junior rider');
UPDATE classes SET rider_category = 'young' WHERE LOWER(rider_category) = 'young rider';
UPDATE classes SET rider_category = 'amateur' WHERE LOWER(rider_category) = 'amateur';
UPDATE classes SET rider_category = 'pro' WHERE LOWER(rider_category) IN ('pro', 'pro rider');
