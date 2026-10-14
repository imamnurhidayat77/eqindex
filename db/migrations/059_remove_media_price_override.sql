-- 059: retire the per-photo price override (media.price_cents).
-- Pricing is tier-only now (license_tiers); the checkout, gallery and buy
-- box no longer read this column. Existing overrides are nulled so no
-- legacy row can silently undercut its tier.
-- The column itself is left in place (all NULL) so this migration is safe
-- to apply before the API redeploys; DROP it in a later cleanup once every
-- environment runs tier-only code.
UPDATE media SET price_cents = NULL WHERE price_cents IS NOT NULL;
