-- 094: one paid purchase per (buyer, photo, VERSION), not per photo.
-- Buyers may own several versions of one photo (plain + sponsor designs);
-- only the identical version twice is double-charging. logo_sig is the
-- version fingerprint ('' = plain). App code computes the same value
-- (see logoSig() in api/src/routes/media.js); this backfills old rows.
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS logo_sig TEXT NOT NULL DEFAULT '';
UPDATE purchases p SET logo_sig =
  COALESCE(p.logo_template, 'corner') || '|' || COALESCE(p.logo_theme, 'light') || '|' ||
  COALESCE(p.logo_variant, '') || '|' ||
  COALESCE((SELECT string_agg(l.sponsor_logo_id::TEXT, ',' ORDER BY l.sponsor_logo_id)
            FROM purchase_sponsor_logos l WHERE l.purchase_id = p.id), '')
  WHERE p.media_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM purchase_sponsor_logos l WHERE l.purchase_id = p.id);
DROP INDEX IF EXISTS purchases_paid_media_owner;
CREATE UNIQUE INDEX IF NOT EXISTS purchases_paid_media_version
  ON purchases (buyer_user_id, media_id, logo_sig)
  WHERE status = 'paid' AND media_id IS NOT NULL;
