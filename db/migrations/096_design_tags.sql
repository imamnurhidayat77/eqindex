-- 096: buyer tag overrides, design-scoped (template only). The buyer edits
-- the horse/rider/class shown in THEIR sponsor design — preview + baked
-- file — without touching the canonical media row (gallery data stays
-- clean, any buyer can still design). NULL = canonical tags, as before.
-- The two columns join the version fingerprint so a retagged design is a
-- new version, not an "already own" 409.
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS design_class TEXT NULL;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS design_subject TEXT NULL;
ALTER TABLE credit_redemptions ADD COLUMN IF NOT EXISTS design_class TEXT NULL;
ALTER TABLE credit_redemptions ADD COLUMN IF NOT EXISTS design_subject TEXT NULL;
-- Extend the 094 fingerprint: old rows keep design_* NULL, so backfilling
-- appends two empty segments — identical to what logoSig() computes for
-- untagged designs on both sides (JS + SQL must stay in sync).
UPDATE purchases p SET logo_sig =
  COALESCE(p.logo_template, 'corner') || '|' || COALESCE(p.logo_theme, 'light') || '|' ||
  COALESCE(p.logo_variant, '') || '|' ||
  COALESCE((SELECT string_agg(l.sponsor_logo_id::TEXT, ',' ORDER BY l.sponsor_logo_id)
            FROM purchase_sponsor_logos l WHERE l.purchase_id = p.id), '') || '|' ||
  COALESCE(p.design_class, '') || '|' || COALESCE(p.design_subject, '')
  WHERE p.media_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM purchase_sponsor_logos l WHERE l.purchase_id = p.id);
DROP INDEX IF EXISTS purchases_paid_media_version;
CREATE UNIQUE INDEX IF NOT EXISTS purchases_paid_media_version
  ON purchases (buyer_user_id, media_id, logo_sig)
  WHERE status = 'paid' AND media_id IS NOT NULL;
