-- 071: event organizers (separate accounts from photographers).
-- Organizers earn a share of platform commission on sales at their events
-- (see docs/WALLET_PLAN.md), then grant balance to volunteers.

CREATE TABLE IF NOT EXISTS organizers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  contact_email TEXT NULL,
  payout_ref TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS organizers_user ON organizers (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE events ADD COLUMN IF NOT EXISTS organizer_id UUID NULL REFERENCES organizers(id);
CREATE INDEX IF NOT EXISTS events_organizer ON events (organizer_id) WHERE organizer_id IS NOT NULL;

-- New staff role: assigned by admins only, never self-registerable
-- (register whitelist stays PUBLIC/RIDER/COACH).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('PUBLIC','RIDER','COACH','OWNER','BREEDER','PHOTOGRAPHER','ORGANIZER','ADMIN'));
