-- 100: community moments via single-address email intake (UPLOAD_EMAIL in .env).
-- Additive only, idempotent. Shop queries must keep filtering source='studio'
-- so moments never leak into packages, settlement, or the buy flow.

-- Short dialable code per event for email subjects (e.g. TAKAPOTO26).
-- NULL until an admin sets it; only coded events accept email uploads.
ALTER TABLE events ADD COLUMN IF NOT EXISTS upload_code TEXT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS events_upload_code_uidx
  ON events (upload_code) WHERE upload_code IS NOT NULL;

-- Community attribution row: keeps media.photographer_id NOT NULL working
-- for community rows, so settlement/package math (keyed by photographer)
-- needs no branching — it just never sees source='email' rows.
INSERT INTO photographers (name, contact_email, commission_rate, is_active)
SELECT 'Community', NULL, 0, true
WHERE NOT EXISTS (SELECT 1 FROM photographers WHERE name = 'Community');

-- Origin tracking on community rows; every existing row stays 'studio'.
ALTER TABLE media ADD COLUMN IF NOT EXISTS uploader_user_id UUID NULL
  REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE media ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'studio'
  CHECK (source IN ('studio', 'email', 'web'));
ALTER TABLE media ADD COLUMN IF NOT EXISTS source_ref TEXT NULL;
CREATE INDEX IF NOT EXISTS media_source_status ON media (source, status);

-- One row per inbound email: webhook idempotency (provider retries must not
-- double-ingest), sender identity, and the consent audit trail NZ law wants
-- (who / when / via which channel).
CREATE TABLE IF NOT EXISTS upload_intakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_msg_id TEXT NOT NULL UNIQUE,
  sender_email TEXT NOT NULL,
  sender_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  event_code TEXT NULL,
  event_id UUID NULL REFERENCES events(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'awaiting_verify', 'in_review', 'done', 'rejected')),
  error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS upload_intakes_sender
  ON upload_intakes (sender_email, created_at DESC);
