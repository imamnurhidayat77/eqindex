-- 111: merch sponsor budget holds (Imam, 2026-11-25). A merch order holds
-- its sponsor discount on the sponsor's merch budget when it is placed,
-- because payment comes days later (after the art proof). Lifecycle:
--   held     order placed; counts against the budget. expires_at is set
--            when the buyer approves the proof (14 days to pay); NULL
--            while the proof is still being made.
--   spent    order paid; the amount moved into sponsor_budgets.spent_cents.
--   released refunded (spent_cents given back) or never paid.
-- Budget left = agreed_cents - spent_cents - active holds. Expired holds
-- simply stop counting, so no cron is needed. Additive only.
CREATE TABLE IF NOT EXISTS merch_sponsor_holds (
  order_id UUID NOT NULL REFERENCES merch_orders(id) ON DELETE CASCADE,
  budget_id UUID NOT NULL REFERENCES sponsor_budgets(id) ON DELETE CASCADE,
  cents INT NOT NULL CHECK (cents >= 0),
  status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'spent', 'released')),
  expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (order_id, budget_id)
);
CREATE INDEX IF NOT EXISTS merch_sponsor_holds_budget ON merch_sponsor_holds (budget_id) WHERE status = 'held';
