-- Class rider-category (migration 036): a real column instead of fuzzy
-- class-name matching. NULL = open/unrestricted. Values use the rider
-- category vocabulary (Pro, Young Rider, Junior Rider, Amateur, Pony).
-- Weekend Best priority: rider's own category > this field > name fallback.
ALTER TABLE classes ADD COLUMN IF NOT EXISTS rider_category TEXT;
CREATE INDEX IF NOT EXISTS classes_rider_category_idx ON classes (rider_category);

-- One-time backfill from unambiguous class names (reviewable, editable).
-- Everything else stays NULL (= open) for admin to set.
UPDATE classes SET rider_category = 'Pony'
WHERE rider_category IS NULL AND name ILIKE '%pony%';
UPDATE classes SET rider_category = 'Junior Rider'
WHERE rider_category IS NULL AND name ILIKE '%junior%';
UPDATE classes SET rider_category = 'Young Rider'
WHERE rider_category IS NULL AND name ILIKE '%young rider%';
UPDATE classes SET rider_category = 'Amateur'
WHERE rider_category IS NULL
  AND (class_type = 'Amateur' OR name ILIKE '%amateur%' OR name ILIKE '%pro am%');
