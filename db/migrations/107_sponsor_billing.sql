-- 107: sponsor budgets are pre-agreed by an admin and billed to the sponsor
-- afterwards. Also separates buyer-nominated logos from official sponsors.

-- 1) Official sponsors vs buyer-nominated logo rows. Both lived in
-- `sponsors` keyed by user_id, so checkout treated every approved sponsor
-- as a buyer's private logo and refused it for everyone else.
ALTER TABLE sponsors ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'official';
ALTER TABLE sponsors DROP CONSTRAINT IF EXISTS sponsors_kind_check;
ALTER TABLE sponsors ADD CONSTRAINT sponsors_kind_check CHECK (kind IN ('official', 'personal'));
-- Backfill: admin-approved and seeded sponsors carry a contact email or a
-- budget; rows made by POST /api/my/sponsor-logos have neither.
UPDATE sponsors s SET kind = 'personal'
 WHERE s.user_id IS NOT NULL AND s.contact_email IS NULL
   AND NOT EXISTS (SELECT 1 FROM sponsor_budgets b WHERE b.sponsor_id = s.id);
-- An approved SPONSOR account always keeps its oldest row as the official profile.
UPDATE sponsors s SET kind = 'official'
 WHERE s.id IN (SELECT DISTINCT ON (s2.user_id) s2.id FROM sponsors s2 JOIN users u ON u.id = s2.user_id
                WHERE u.role = 'SPONSOR' ORDER BY s2.user_id, s2.created_at);

-- 2) Budget lifecycle: optional end date, pause/close by admin.
ALTER TABLE sponsor_budgets ADD COLUMN IF NOT EXISTS ends_on DATE NULL;
ALTER TABLE sponsor_budgets ADD COLUMN IF NOT EXISTS note TEXT NULL;
ALTER TABLE sponsor_budgets DROP CONSTRAINT IF EXISTS sponsor_budgets_status_check;
ALTER TABLE sponsor_budgets ADD CONSTRAINT sponsor_budgets_status_check
  CHECK (status IN ('active', 'paused', 'closed'));

-- 3) Bills: one row per statement sent to the sponsor. Usage rows
-- (discounts + gifts) point at the bill that charged them, so nothing is
-- billed twice and unbilled usage is always "bill_id IS NULL".
CREATE TABLE IF NOT EXISTS sponsor_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES sponsor_budgets(id),
  amount_cents INT NOT NULL CHECK (amount_cents > 0),
  items INT NOT NULL,
  period_from TIMESTAMPTZ NOT NULL,
  period_to TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'billed' CHECK (status IN ('billed', 'paid')),
  reference TEXT NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS sponsor_bills_budget ON sponsor_bills (budget_id, created_at DESC);
ALTER TABLE sponsored_redemptions ADD COLUMN IF NOT EXISTS bill_id UUID NULL REFERENCES sponsor_bills(id);
ALTER TABLE sponsor_gifts ADD COLUMN IF NOT EXISTS bill_id UUID NULL REFERENCES sponsor_bills(id);
