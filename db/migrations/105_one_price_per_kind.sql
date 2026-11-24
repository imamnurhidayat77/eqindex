-- 105: one download price for photos and one for reels (Imam, 2026-11-24).
-- 'web' becomes the photo price, 'reel' the reel price. Other tiers stay in the
-- table for past purchases but are hidden from the shop. sponsor-repost is
-- untouched (community moments licence, separate flow).
INSERT INTO license_tiers (id, label, max_resolution, price_cents, printable, sort_order, applies_to)
SELECT 'reel', 'Reel', 'original',
       COALESCE((SELECT price_cents FROM license_tiers WHERE id = 'reel_hd'), 5500), TRUE, 2, 'reel'
ON CONFLICT (id) DO NOTHING;

UPDATE license_tiers SET applies_to = 'photo' WHERE id = 'web';
UPDATE license_tiers SET is_hidden = TRUE WHERE id NOT IN ('web', 'reel', 'sponsor-repost');

-- Per-photo default tiers no longer mean anything. Keep a copy so this is reversible.
CREATE TABLE IF NOT EXISTS media_license_default_backup_105 AS
  SELECT id, license_default FROM media WHERE license_default IS NOT NULL;
UPDATE media SET license_default = NULL
 WHERE license_default IS NOT NULL AND license_default NOT IN ('web', 'reel', 'sponsor-repost');
