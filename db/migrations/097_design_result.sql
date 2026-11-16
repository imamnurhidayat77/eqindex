-- 097: buyer result text, design-scoped like class (migration 096).
-- "Clear", "1st", … shown in THIS design's winner laurels only — preview +
-- baked file. Canonical media row has no result text (moment enum covers
-- win/clear/debut/pb). NULL = default "WINNER", as before.
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS design_result TEXT NULL;
ALTER TABLE credit_redemptions ADD COLUMN IF NOT EXISTS design_result TEXT NULL;
-- Extend the 094/096 fingerprint: old rows keep design_result NULL, so the
-- backfill appends one more empty segment — identical to what logoSig()
-- computes for untagged designs on both sides (JS + SQL must stay in sync).
UPDATE purchases p SET logo_sig =
  COALESCE(p.logo_template, 'corner') || '|' || COALESCE(p.logo_theme, 'light') || '|' ||
  COALESCE(p.logo_variant, '') || '|' ||
  COALESCE((SELECT string_agg(l.sponsor_logo_id::TEXT, ',' ORDER BY l.sponsor_logo_id)
            FROM purchase_sponsor_logos l WHERE l.purchase_id = p.id), '') || '|' ||
  COALESCE(p.design_class, '') || '|' || COALESCE(p.design_subject, '') || '|' ||
  COALESCE(p.design_result, '')
  WHERE p.media_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM purchase_sponsor_logos l WHERE l.purchase_id = p.id);
DROP INDEX IF EXISTS purchases_paid_media_version;
CREATE UNIQUE INDEX IF NOT EXISTS purchases_paid_media_version
  ON purchases (buyer_user_id, media_id, logo_sig)
  WHERE status = 'paid' AND media_id IS NOT NULL;
