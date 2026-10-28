-- 081: session idle timeout + admin TOTP MFA.
-- last_seen_at slides on activity; roles with money/power get a short fuse.
-- totp_secret is stored plaintext-equivalent (like any TOTP server secret):
-- DB read access already equals account takeover, same as password_hashes.

ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS sessions_last_seen ON public.sessions (last_seen_at);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS totp_verified_at TIMESTAMPTZ;

-- Short-lived MFA login challenges (password OK, code pending).
CREATE TABLE IF NOT EXISTS public.mfa_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mfa_challenges_user ON public.mfa_challenges (user_id);
