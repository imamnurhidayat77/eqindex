-- 106: each photographer sets their own download price (Imam, 2026-11-24).
-- license_tiers stays the platform default (admin only). A row here overrides
-- the default for one photographer and one price ('web' = photo, 'reel' = reel).
-- No row means the photographer uses the platform price.
CREATE TABLE IF NOT EXISTS photographer_prices (
  photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  tier_id TEXT NOT NULL REFERENCES license_tiers(id),
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (photographer_id, tier_id),
  CONSTRAINT photographer_prices_tier CHECK (tier_id IN ('web', 'reel'))
);
