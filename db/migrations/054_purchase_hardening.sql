-- 054: purchase hardening (audit batch 1).
-- Idempotent: safe to re-run.
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS stripe_payment_intent TEXT;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS purchases_idempotency_key
  ON purchases (idempotency_key) WHERE idempotency_key IS NOT NULL;
-- Email hygiene: bounded length; comparison stays lower() in queries.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'purchases' AND constraint_name = 'purchases_email_len'
  ) THEN
    ALTER TABLE purchases ADD CONSTRAINT purchases_email_len
      CHECK (buyer_email IS NULL OR length(buyer_email) <= 254);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'purchases' AND constraint_name = 'purchases_amount_pos'
  ) THEN
    ALTER TABLE purchases ADD CONSTRAINT purchases_amount_pos
      CHECK (amount_cents > 0);
  END IF;
END $$;
