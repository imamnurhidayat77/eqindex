-- Rider category vocabulary — migration 045.
-- The old CHECK allowed only legacy display labels ('Junior', 'Young Rider',
-- ...), while every code path (Admin, CSV import via canonCategoryKey,
-- rankings ?series= filter) reads and writes master KEYS (pro/young/junior/
-- amateur/pony). The constraint rejected exactly the values the app writes,
-- so category pages could never populate. Drop it: the master table
-- rider_categories (Admin → Categories) + canonCategoryKey are the
-- vocabulary now, and they stay editable without DDL.
ALTER TABLE riders DROP CONSTRAINT IF EXISTS riders_series_category_check;
