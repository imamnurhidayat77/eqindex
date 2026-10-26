-- 079: free-text "other people" tag on media (judges, volunteers, crew…).
-- Photos aren't only riders and horses. One TEXT column, no new tables:
-- shown as caption fallback, matched by client-side search. Packages,
-- credits and checkout stay horse/rider-scoped.
ALTER TABLE media ADD COLUMN IF NOT EXISTS other_people TEXT NULL;
