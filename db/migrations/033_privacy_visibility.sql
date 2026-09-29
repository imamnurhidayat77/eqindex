-- EQIndex privacy opt-out — migration 033
-- Stakeholder request: young riders (or parents) can ask to be "blurred".
-- The sporting record stays in the database (results, points, aggregates
-- untouched); the API masks DISPLAYED names for non-admin callers.
-- Pseudonyms are deterministic (md5 of id, computed API-side), so
-- partnerships, trends and links stay stable without storing extra state.

ALTER TABLE riders ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public', 'anonymous'));

ALTER TABLE horses ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public', 'anonymous'));

CREATE INDEX riders_visibility_idx ON riders (visibility) WHERE visibility = 'anonymous';
CREATE INDEX horses_visibility_idx ON horses (visibility) WHERE visibility = 'anonymous';
