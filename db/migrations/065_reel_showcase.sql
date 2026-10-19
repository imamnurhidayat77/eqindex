-- 065: reel showcase consent (private by default).
-- A finished custom reel belongs to its buyer: it stays OUT of public
-- galleries/search/strips unless the buyer opts into showcase at order time
-- (or the admin toggles it later with consent). Direct-upload reels (no
-- order) are unaffected — the photographer publishes those deliberately.
-- Idempotent.

ALTER TABLE reel_orders ADD COLUMN IF NOT EXISTS showcase BOOLEAN NOT NULL DEFAULT FALSE;
