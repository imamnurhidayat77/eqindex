-- 063: P1b growth catch-up (see docs/MASTER_PLAN.md P1b).
-- 1. Early-bird pricing on photo packages + credit packs (admin-set price +
--    cutoff; checkout honors it while active).
-- 2. In-app notifications (no email provider in the stack yet — this table
--    powers the header bell now and email digests later in P3).
-- 3. alert_prefs.new_photos opt-in for photos-live notifications (default on).
-- Idempotent.

ALTER TABLE packages ADD COLUMN IF NOT EXISTS early_price_cents INT NULL;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS early_until TIMESTAMPTZ NULL;
ALTER TABLE credit_packs ADD COLUMN IF NOT EXISTS early_price_cents INT NULL;
ALTER TABLE credit_packs ADD COLUMN IF NOT EXISTS early_until TIMESTAMPTZ NULL;

ALTER TABLE alert_prefs ADD COLUMN IF NOT EXISTS new_photos BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('package-topup', 'photos-live', 'order-update')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT NULL,
  ref_key TEXT NOT NULL,
  count INT NOT NULL DEFAULT 1 CHECK (count >= 1),
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, kind, ref_key)
);
CREATE INDEX IF NOT EXISTS notifications_user_unread ON notifications (user_id, read_at, updated_at DESC);
