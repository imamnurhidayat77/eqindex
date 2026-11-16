-- 098: buyer-owned social connections (buyer-only, no official account dependency).
-- Each buyer connects THEIR OWN Instagram Business/Creator or FB Page to let
-- BossMedia post on their behalf and read insights of those posts.
-- Tokens are stored ciphertext (enc_token); never log or return them.
CREATE TABLE IF NOT EXISTS social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('ig', 'fb_page')),
  remote_id TEXT NOT NULL,
  name TEXT,
  enc_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider, remote_id)
);
CREATE INDEX IF NOT EXISTS social_accounts_user_idx ON social_accounts (user_id);
