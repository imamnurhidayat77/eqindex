-- EQIndex auth system — migration 011
-- TRAINER renamed to COACH; password auth (bcrypt hash, never plaintext — FR-04);
-- opaque server sessions; rider profile claims; coach↔athlete links.

-- ============ 1. COACH role (rename TRAINER) ============
UPDATE users SET role = 'COACH' WHERE role = 'TRAINER';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('PUBLIC','RIDER','COACH','OWNER','BREEDER','ADMIN'));

-- ============ 2. Password auth (FR-04: hash only) ============
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- ============ 3. Server sessions (opaque token, sha256 stored) ============
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  ip TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at);

-- ============ 4. Rider profile claims ============
ALTER TABLE riders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE riders ADD COLUMN IF NOT EXISTS claim_status TEXT NOT NULL DEFAULT 'unclaimed'
  CHECK (claim_status IN ('unclaimed','pending','verified','rejected'));
CREATE UNIQUE INDEX IF NOT EXISTS riders_user_uidx ON riders (user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS rider_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rider_id, user_id)
);

-- ============ 5. Coach ↔ athlete roster ============
CREATE TABLE IF NOT EXISTS coach_athletes (
  coach_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (coach_user_id, rider_id)
);
