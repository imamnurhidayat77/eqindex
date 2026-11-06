-- 085: sponsor accounts (brand sponsors funding logo-photo discounts).
-- Sponsors are approved by admins only, never self-registerable
-- (register whitelist stays PUBLIC/RIDER/COACH).

CREATE TABLE IF NOT EXISTS sponsors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  contact_email TEXT NULL,
  website TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sponsors_user ON sponsors (user_id) WHERE user_id IS NOT NULL;

-- Brand logos a sponsor may bake into photos (validated PNG, capped size).
CREATE TABLE IF NOT EXISTS sponsor_logos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id UUID NOT NULL REFERENCES sponsors(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT 'image/png',
  bytes INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sponsor_logos_sponsor ON sponsor_logos (sponsor_id);

-- Pre-agreed per-event budgets funding rider discounts (billed later).
CREATE TABLE IF NOT EXISTS sponsor_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id UUID NOT NULL REFERENCES sponsors(id) ON DELETE CASCADE,
  event_id UUID NULL REFERENCES events(id) ON DELETE SET NULL,
  agreed_cents INT NOT NULL DEFAULT 0,
  spent_cents INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sponsor_budgets_sponsor ON sponsor_budgets (sponsor_id);

-- New staff role: assigned by admins only, never self-registerable
-- (register whitelist stays PUBLIC/RIDER/COACH).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('PUBLIC','RIDER','COACH','OWNER','BREEDER','PHOTOGRAPHER','ORGANIZER','SPONSOR','ADMIN'));
