-- 108: merch orders (Imam, 2026-11-24). Flow: submitted -> artwork_review ->
-- proof_sent -> approved -> paid -> in_production -> shipped -> delivered,
-- with changes_requested / cancelled / refunded on the side. Payment comes
-- after proof approval, so nothing here charges money yet.
CREATE TABLE IF NOT EXISTS merch_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref TEXT NOT NULL UNIQUE, -- human reference shown to the buyer, e.g. BM-7K3Q9D
  access_hash TEXT NOT NULL, -- sha256 of the buyer's view token (guests)
  buyer_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  buyer_email TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  buyer_phone TEXT NULL,
  club_name TEXT NULL,
  product_id TEXT NOT NULL,
  color TEXT NOT NULL,
  design JSONB NOT NULL, -- { slots, slotZoom, slotShift } as the designer stores it
  delivery TEXT NOT NULL CHECK (delivery IN ('courier', 'pickup')),
  address JSONB NULL, -- { line1, line2, city, postcode } for courier
  notes TEXT NULL,
  quote JSONB NOT NULL, -- server quote at submit time (re-quoted at payment)
  total_cents INT NOT NULL CHECK (total_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'NZD',
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN (
    'submitted', 'artwork_review', 'changes_requested', 'proof_sent', 'approved',
    'paid', 'in_production', 'shipped', 'delivered', 'cancelled', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS merch_orders_status ON merch_orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS merch_orders_buyer ON merch_orders (buyer_user_id, created_at DESC) WHERE buyer_user_id IS NOT NULL;

-- Units per size.
CREATE TABLE IF NOT EXISTS merch_order_lines (
  order_id UUID NOT NULL REFERENCES merch_orders(id) ON DELETE CASCADE,
  size TEXT NOT NULL,
  qty INT NOT NULL CHECK (qty BETWEEN 1 AND 200),
  PRIMARY KEY (order_id, size)
);

-- Buyer artwork uploaded for an order (print resolution, kept on the
-- server; the designer's blob URLs die with the tab). Uploaded before the
-- order exists, claimed by it with the upload's secret.
CREATE TABLE IF NOT EXISTS merch_order_logos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NULL REFERENCES merch_orders(id) ON DELETE CASCADE,
  claim_hash TEXT NOT NULL,
  r2_key TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL,
  bytes INT NOT NULL,
  width INT NULL,
  height INT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS merch_order_logos_order ON merch_order_logos (order_id);

-- Status history (who moved it, when, why).
CREATE TABLE IF NOT EXISTS merch_order_events (
  id BIGSERIAL PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES merch_orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT NULL,
  actor_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS merch_order_events_order ON merch_order_events (order_id, created_at);
