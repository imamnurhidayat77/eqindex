-- 076: purchases can be 'cancelled' (expired/unpaid balance holds released
-- without ever touching Stripe). Webhook paid/refund flows are untouched:
-- they only ever transition pending -> paid and paid -> refunded.

ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_status_check;
ALTER TABLE purchases ADD CONSTRAINT purchases_status_check
  CHECK (status IN ('pending', 'paid', 'refunded', 'cancelled'));

CREATE INDEX IF NOT EXISTS purchases_pending_holds
  ON purchases (created_at) WHERE status = 'pending' AND balance_used_cents > 0;
