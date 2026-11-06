-- 088: sponsor logo approvals (Option 3) + gifted winner credits (PLUS 2).
-- Approvals are a permission ledger: a sponsor requests, the photo's
-- photographer approves, then the sponsor buys through the normal
-- Option 1 flow. Gifts mint active credit bundles funded by a budget.

CREATE TABLE IF NOT EXISTS logo_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  sponsor_logo_id UUID NOT NULL REFERENCES sponsor_logos(id),
  sponsor_id UUID NOT NULL REFERENCES sponsors(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS logo_approvals_sponsor ON logo_approvals (sponsor_id);
CREATE INDEX IF NOT EXISTS logo_approvals_media ON logo_approvals (media_id);

CREATE TABLE IF NOT EXISTS sponsor_gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES sponsor_budgets(id),
  bundle_id UUID NOT NULL REFERENCES credit_bundles(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  slots INT NOT NULL,
  cost_cents INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
