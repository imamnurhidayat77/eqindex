-- 101: first-time sender verification for email moments (double opt-in).
-- Additive only, idempotent. A sender's photos wait as drafts until the
-- sender clicks the verify link: that click proves inbox ownership (the
-- anti-spoofing gate) and records consent + rider claims in one step.

-- One row per sender address. verified_at set on first completed verify;
-- later emails from the same address skip verification entirely.
CREATE TABLE IF NOT EXISTS upload_senders (
  email TEXT PRIMARY KEY,
  verified_at TIMESTAMPTZ NULL,
  phone TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Single-use verify tokens, sha256 at rest (same pattern as password_resets).
-- One live token per sender: issuing a new one kills the older unused ones.
CREATE TABLE IF NOT EXISTS upload_verify_tokens (
  token_hash TEXT PRIMARY KEY,
  sender_email TEXT NOT NULL REFERENCES upload_senders(email) ON DELETE CASCADE,
  intake_id UUID NULL REFERENCES upload_intakes(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS upload_verify_tokens_sender
  ON upload_verify_tokens (sender_email, used_at);

-- Claims captured on the verify page. Tag kanonis tetap ditulis admin saat
-- approve (P3) — kolom ini hanya petunjuk, bukan tag.
ALTER TABLE upload_intakes ADD COLUMN IF NOT EXISTS claimed_rider_name TEXT NULL;
ALTER TABLE upload_intakes ADD COLUMN IF NOT EXISTS claimed_horse_name TEXT NULL;
ALTER TABLE upload_intakes ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ NULL;
ALTER TABLE upload_intakes ADD COLUMN IF NOT EXISTS sender_phone TEXT NULL;
