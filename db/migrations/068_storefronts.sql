-- 068: storefronts (Boss Media split, MASTER_PLAN §10).
-- One backend, N storefronts. Each storefront binds a domain/brand to one
-- photographer (later: orgs, multi-vendor). Commerce queries filter by
-- storefront; pricing overrides live here, not hardcoded per brand.
-- Idempotent; safe to run before any app code reads it.

CREATE TABLE IF NOT EXISTS storefronts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  domain TEXT NULL,
  photographer_id UUID NULL REFERENCES photographers(id),
  theme TEXT NOT NULL DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO storefronts (slug, name, domain, photographer_id, theme)
SELECT 'boss-media', 'Boss Media', 'bossmedia.nz', p.id, 'boss'
FROM photographers p WHERE p.name = 'Boss Media'
AND NOT EXISTS (SELECT 1 FROM storefronts WHERE slug = 'boss-media')
ORDER BY p.created_at LIMIT 1;
