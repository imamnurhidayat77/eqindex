-- 084: one Stripe session covers MANY purchase rows (batch/combined), so
-- stripe_session_id must not be unique. Keep it indexed for webhook and
-- refund lookups. (Companion to 083: together they un-break multi-item
-- carts, which 500'd on the 2nd row under either old constraint.)
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_stripe_session_id_key;
DROP INDEX IF EXISTS purchases_stripe_session_id_key;
CREATE INDEX IF NOT EXISTS purchases_stripe_session_id
  ON purchases (stripe_session_id) WHERE stripe_session_id IS NOT NULL;
