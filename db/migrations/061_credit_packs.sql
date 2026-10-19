-- 061: photo credit packs (5-pack bundles) + placeholder price seeds.
-- Model: buyer purchases a credit bundle scoped to 1 event x 1 rider/horse,
-- then unlocks any N photos in that scope (no cart). Stills only; reels have
-- their own products (migration 060). All prices admin-editable; the seeds
-- below are placeholders (NZD) to be confirmed with the photographer.

CREATE TABLE IF NOT EXISTS credit_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES photographers(id),
  event_id UUID NULL REFERENCES events(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL DEFAULT 'rider' CHECK (scope_type IN ('rider', 'horse')),
  slots INT NOT NULL DEFAULT 5 CHECK (slots > 0),
  price_cents INT NOT NULL CHECK (price_cents >= 0),
  sort_order INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS credit_packs_event_status ON credit_packs (event_id, status);

-- Issued bundle: one buyer's credits for one concrete event x subject.
CREATE TABLE IF NOT EXISTS credit_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES credit_packs(id),
  event_id UUID NOT NULL REFERENCES events(id),
  rider_id UUID NULL REFERENCES riders(id),
  horse_id UUID NULL REFERENCES horses(id),
  buyer_user_id UUID NULL,
  buyer_email TEXT NOT NULL,
  slots_total INT NOT NULL CHECK (slots_total > 0),
  status TEXT NOT NULL DEFAULT 'awaiting_payment'
    CHECK (status IN ('awaiting_payment', 'active', 'cancelled')),
  purchase_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (num_nonnulls(rider_id, horse_id) = 1)
);
CREATE INDEX IF NOT EXISTS credit_bundles_buyer ON credit_bundles (buyer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS credit_bundles_subject ON credit_bundles (event_id, rider_id, horse_id, status);

-- One redemption = one unlocked photo. Re-downloads stay free (row persists).
CREATE TABLE IF NOT EXISTS credit_redemptions (
  bundle_id UUID NOT NULL REFERENCES credit_bundles(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (bundle_id, media_id)
);
CREATE INDEX IF NOT EXISTS credit_redemptions_media ON credit_redemptions (media_id);

-- Purchases gain a fourth item type: credit bundles.
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS credit_bundle_id UUID NULL REFERENCES credit_bundles(id);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchases_item_check') THEN
    ALTER TABLE purchases DROP CONSTRAINT purchases_item_check;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchases_item_check4') THEN
    ALTER TABLE purchases ADD CONSTRAINT purchases_item_check4
      CHECK (num_nonnulls(media_id, package_id, reel_order_id, credit_bundle_id) = 1);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS purchases_credit_bundle ON purchases (credit_bundle_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_bundles_purchase_fk') THEN
    ALTER TABLE credit_bundles ADD CONSTRAINT credit_bundles_purchase_fk
      FOREIGN KEY (purchase_id) REFERENCES purchases(id);
  END IF;
END $$;

-- Placeholder seeds (global defaults, event_id NULL). Admin overrides per
-- event in /admin/pricing. Idempotent.
INSERT INTO credit_packs (photographer_id, event_id, scope_type, slots, price_cents, sort_order, status)
SELECT p.id, NULL, 'rider', 5, 12900, 1, 'published'
FROM photographers p WHERE p.is_active
AND NOT EXISTS (SELECT 1 FROM credit_packs WHERE event_id IS NULL AND scope_type = 'rider')
ORDER BY p.created_at LIMIT 1;

INSERT INTO credit_packs (photographer_id, event_id, scope_type, slots, price_cents, sort_order, status)
SELECT p.id, NULL, 'horse', 5, 12900, 2, 'published'
FROM photographers p WHERE p.is_active
AND NOT EXISTS (SELECT 1 FROM credit_packs WHERE event_id IS NULL AND scope_type = 'horse')
ORDER BY p.created_at LIMIT 1;

INSERT INTO reel_products (photographer_id, event_id, name, scope, coverage, includes_raw, description, price_cents, sort_order, status)
SELECT p.id, NULL, 'Raw clip (~5s)', 'clip', 'ring', false,
  'Unedited key moment, priced per clip', 2500, 1, 'published'
FROM photographers p WHERE p.is_active
AND NOT EXISTS (SELECT 1 FROM reel_products WHERE event_id IS NULL AND scope = 'clip')
ORDER BY p.created_at LIMIT 1;

INSERT INTO reel_products (photographer_id, event_id, name, scope, coverage, includes_raw, description, price_cents, sort_order, status)
SELECT p.id, NULL, 'Silver — round edit', 'round', 'ring', false,
  'One round edited for socials, music included', 14900, 2, 'published'
FROM photographers p WHERE p.is_active
AND NOT EXISTS (SELECT 1 FROM reel_products WHERE event_id IS NULL AND name = 'Silver — round edit')
ORDER BY p.created_at LIMIT 1;

INSERT INTO reel_products (photographer_id, event_id, name, scope, coverage, includes_raw, description, price_cents, sort_order, status)
SELECT p.id, NULL, 'Gold — round edit + raw', 'round', 'full', true,
  'Warm-up, ring and behind the scenes, edited with music + raw footage', 22900, 3, 'published'
FROM photographers p WHERE p.is_active
AND NOT EXISTS (SELECT 1 FROM reel_products WHERE event_id IS NULL AND name = 'Gold — round edit + raw')
ORDER BY p.created_at LIMIT 1;

INSERT INTO reel_products (photographer_id, event_id, name, scope, coverage, includes_raw, description, price_cents, sort_order, status)
SELECT p.id, NULL, 'Event edit', 'event', 'full', true,
  'Whole-event highlight for one rider, multi-class + behind the scenes', 39900, 4, 'published'
FROM photographers p WHERE p.is_active
AND NOT EXISTS (SELECT 1 FROM reel_products WHERE event_id IS NULL AND scope = 'event')
ORDER BY p.created_at LIMIT 1;
