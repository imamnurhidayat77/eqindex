-- 095: sponsor logos on credit unlocks. A credit unlock is free (no
-- per-photo money moves, so no sponsor discount or billing), but the buyer
-- picks logos the same way as a paid checkout and the baked file is served
-- on download. One unlock per (bundle, photo) stays: the design lives on
-- the redemption row and can be re-picked for free (logo_variant_key is
-- cleared so the next download re-bakes). NULL = plain unlock, as before.
ALTER TABLE credit_redemptions ADD COLUMN IF NOT EXISTS sponsor_logo_ids UUID[] NULL;
ALTER TABLE credit_redemptions ADD COLUMN IF NOT EXISTS logo_template TEXT NULL;
ALTER TABLE credit_redemptions ADD COLUMN IF NOT EXISTS logo_theme TEXT NULL;
ALTER TABLE credit_redemptions ADD COLUMN IF NOT EXISTS logo_variant TEXT NULL;
ALTER TABLE credit_redemptions ADD COLUMN IF NOT EXISTS logo_positions JSONB NULL;
ALTER TABLE credit_redemptions ADD COLUMN IF NOT EXISTS logo_variant_key TEXT NULL;
