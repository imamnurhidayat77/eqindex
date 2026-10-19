-- 060: reel products (admin-set prices per event) + reel orders (request-based, music picker ala Sportfot).
-- See docs/REELS_PLAN.md. Idempotent.
-- Sportfot reference: tiered coverage (Silver ring-only vs Gold warm-up+ring+BTS),
-- each with a +raw-footage variant; order form asks Music = choose for me | title | none.

CREATE TABLE IF NOT EXISTS reel_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES photographers(id),
  event_id UUID NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'round' CHECK (scope IN ('clip', 'round', 'event')),
  coverage TEXT NOT NULL DEFAULT 'ring' CHECK (coverage IN ('ring', 'full')),
  includes_raw BOOLEAN NOT NULL DEFAULT false,
  description TEXT NULL,
  price_cents INT NOT NULL CHECK (price_cents >= 0),
  sort_order INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reel_products_event_status ON reel_products (event_id, status);

CREATE TABLE IF NOT EXISTS reel_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES reel_products(id),
  event_id UUID NULL REFERENCES events(id),
  buyer_user_id UUID NULL,
  buyer_email TEXT NOT NULL,
  shooting_date DATE NULL,
  ring TEXT NULL,
  class_name TEXT NULL,
  back_number TEXT NULL,
  horse_name TEXT NOT NULL,
  music_mode TEXT NOT NULL DEFAULT 'choose_for_me'
    CHECK (music_mode IN ('choose_for_me', 'title', 'none')),
  music_title TEXT NULL,
  phone TEXT NULL,
  selfie_key TEXT NULL,
  price_cents INT NOT NULL CHECK (price_cents >= 0),
  status TEXT NOT NULL DEFAULT 'awaiting_payment'
    CHECK (status IN ('awaiting_payment', 'pending', 'in_production', 'ready', 'delivered', 'cancelled')),
  purchase_id UUID NULL,
  media_id UUID NULL REFERENCES media(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reel_orders_event_status ON reel_orders (event_id, status);
CREATE INDEX IF NOT EXISTS reel_orders_buyer ON reel_orders (buyer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reel_orders_product ON reel_orders (product_id);

-- Purchases gain a third item type: reel service orders.
-- The original 053 CHECK was inline/unnamed (=> purchases_check).
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS reel_order_id UUID NULL REFERENCES reel_orders(id);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchases_check') THEN
    ALTER TABLE purchases DROP CONSTRAINT purchases_check;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchases_item_check') THEN
    ALTER TABLE purchases ADD CONSTRAINT purchases_item_check
      CHECK (num_nonnulls(media_id, package_id, reel_order_id) = 1);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS purchases_reel_order ON purchases (reel_order_id);

-- Link order -> purchase after checkout row exists (FK added separately to
-- avoid a creation-order cycle; both directions nullable so either can lead).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reel_orders_purchase_fk') THEN
    ALTER TABLE reel_orders ADD CONSTRAINT reel_orders_purchase_fk
      FOREIGN KEY (purchase_id) REFERENCES purchases(id);
  END IF;
END $$;
