-- 087: sponsor-funded discounts (Option 2).
-- A budget carries a fixed per-redemption discount; the buyer pays
-- price - discount, the photographer is still paid on the full price,
-- and the platform absorbs the difference (billed to the sponsor later).

ALTER TABLE sponsor_budgets ADD COLUMN IF NOT EXISTS discount_cents INT NOT NULL DEFAULT 0;

ALTER TABLE purchases ADD COLUMN IF NOT EXISTS original_amount_cents INT NULL;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS sponsor_budget_id UUID NULL REFERENCES sponsor_budgets(id);

-- Immutable ledger: one row per discounted purchase (pilot billing source).
CREATE TABLE IF NOT EXISTS sponsored_redemptions (
  purchase_id UUID PRIMARY KEY REFERENCES purchases(id) ON DELETE CASCADE,
  budget_id UUID NOT NULL REFERENCES sponsor_budgets(id),
  discount_cents INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
