-- 067: hideable license tiers (admin Pricing can hide a tier from buyers
-- without deleting it; delete stays blocked while in use).
-- Public GET /api/license-tiers filters hidden rows; checkout rejects
-- explicitly-chosen hidden tiers. Past purchases are unaffected.

ALTER TABLE license_tiers ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;
