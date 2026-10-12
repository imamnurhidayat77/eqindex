-- 053: photo/reel sales platform P0 (see docs/PHOTO_PLATFORM_PLAN.md).
-- Single photographer v1, schema multi-ready. Idempotent.
-- Storage itself (R2 bucket) is provisioned outside the DB; keys below
-- assume layout eqindex-media/{originals,previews,thumbs}/{event_id}/{media_id}.{ext}.

CREATE TABLE IF NOT EXISTS photographers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL,
  name TEXT NOT NULL,
  contact_email TEXT NULL,
  payout_ref TEXT NULL,
  commission_rate NUMERIC NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS license_tiers (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  max_resolution TEXT NULL,
  price_cents INT NOT NULL,
  printable BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES photographers(id),
  event_id UUID NULL,
  class_id UUID NULL,
  horse_id UUID NULL,
  rider_id UUID NULL,
  kind TEXT NOT NULL DEFAULT 'photo' CHECK (kind IN ('photo', 'reel')),
  storage_key TEXT NULL,
  preview_key TEXT NULL,
  thumb_key TEXT NULL,
  poster_key TEXT NULL,
  width INT NULL,
  height INT NULL,
  taken_at TIMESTAMPTZ NULL,
  price_cents INT NULL,
  license_default TEXT NULL REFERENCES license_tiers(id),
  moment TEXT NULL CHECK (moment IS NULL OR moment IN ('win', 'clear', 'debut', 'pb')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  view_count INT NOT NULL DEFAULT 0,
  purchase_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS media_event_status ON media (event_id, status);
CREATE INDEX IF NOT EXISTS media_horse_status ON media (horse_id, status);
CREATE INDEX IF NOT EXISTS media_rider_status ON media (rider_id, status);
CREATE INDEX IF NOT EXISTS media_class_status ON media (class_id, status);
CREATE INDEX IF NOT EXISTS media_photographer_status ON media (photographer_id, status);
CREATE INDEX IF NOT EXISTS media_status_created ON media (status, created_at DESC);

CREATE TABLE IF NOT EXISTS packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES photographers(id),
  event_id UUID NULL,
  horse_id UUID NULL,
  rider_id UUID NULL,
  title TEXT NOT NULL,
  price_cents INT NOT NULL,
  auto BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS package_items (
  package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  PRIMARY KEY (package_id, media_id)
);

CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id UUID NULL REFERENCES media(id),
  package_id UUID NULL REFERENCES packages(id),
  buyer_email TEXT NOT NULL,
  buyer_user_id UUID NULL,
  license_tier TEXT NULL REFERENCES license_tiers(id),
  amount_cents INT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NZD',
  stripe_session_id TEXT UNIQUE NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (num_nonnulls(media_id, package_id) = 1)
);

CREATE TABLE IF NOT EXISTS media_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  viewer_hash TEXT NOT NULL,
  referrer TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS media_views_media ON media_views (media_id, created_at DESC);

-- Seed license tiers (global v1 ladder).
INSERT INTO license_tiers (id, label, max_resolution, price_cents, printable, sort_order) VALUES
  ('social', 'Social', '1417x945', 1500, false, 1),
  ('web', 'Web', '2400x1600', 3500, false, 2),
  ('print', 'Print Hi-Res', 'original', 7500, true, 3),
  ('commercial', 'Commercial', 'original', 15000, true, 4)
ON CONFLICT (id) DO NOTHING;

-- Seed single photographer row (v1). Rename + set commission in admin;
-- multi-vendor later = add rows, not migrations.
INSERT INTO photographers (name, contact_email, commission_rate, is_active)
SELECT 'TBC Photographer', NULL, 0.15, true
WHERE NOT EXISTS (SELECT 1 FROM photographers);
