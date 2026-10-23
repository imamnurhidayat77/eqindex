-- 072: account balance (NZD wallet). wallet_transactions is append-only and
-- the source of truth; users.balance_cents is a read cache that must only
-- ever change inside the same DB transaction that inserts the ledger row
-- (SELECT ... FOR UPDATE + CHECK (balance_cents >= 0) guards double-spend).

ALTER TABLE users ADD COLUMN IF NOT EXISTS balance_cents INT NOT NULL DEFAULT 0
  CONSTRAINT users_balance_nonneg CHECK (balance_cents >= 0);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'organizer_share',
    'grant',
    'grant_received',
    'spend',
    'refund',
    'adjust',
    'payout'
  )),
  amount_cents INT NOT NULL CHECK (amount_cents <> 0),
  balance_after_cents INT NOT NULL,
  purchase_id UUID NULL REFERENCES purchases(id),
  counterparty_user_id UUID NULL REFERENCES users(id),
  reason TEXT NULL,
  created_by UUID NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS wallet_tx_user ON wallet_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_tx_purchase ON wallet_transactions (purchase_id) WHERE purchase_id IS NOT NULL;
