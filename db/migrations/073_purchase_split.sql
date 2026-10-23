-- 073: immutable per-purchase money split (10/10/80 of gross by default).
-- Written once on the pending -> paid transition; reports read these columns
-- instead of re-deriving from live rates. Without an active organizer on the
-- event, organizer_payout_cents stays 0 and the platform keeps the remainder.

ALTER TABLE purchases ADD COLUMN IF NOT EXISTS platform_fee_cents INT NULL;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS photographer_payout_cents INT NULL;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS organizer_payout_cents INT NOT NULL DEFAULT 0;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS organizer_id UUID NULL REFERENCES organizers(id);
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS balance_used_cents INT NOT NULL DEFAULT 0;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS stripe_amount_cents INT NULL;
