-- 103: flat-fee sponsor repost license for community moments.
-- Community rows are free and never enter the shop — this is the ONLY tier
-- the checkout accepts for them. Price is admin-editable via the existing
-- Pricing tiers editor (no code change per adjustment).
INSERT INTO license_tiers (id, label, max_resolution, price_cents, printable, sort_order, applies_to)
VALUES ('sponsor-repost', 'Sponsor repost', 'original', 9900, false, 5, 'both')
ON CONFLICT (id) DO NOTHING;
