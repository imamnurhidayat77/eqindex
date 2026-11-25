-- Trigram matching for "similar to an existing horse/rider" import hints.
-- The import dry-run asks for the closest existing normalized_name of each
-- NEW horse/rider (pg_trgm similarity); these GIN indexes keep that one
-- batched query fast. Read-only feature: nothing is merged automatically.
--
-- Locking: apply-migration.js runs this in one transaction, so the indexes
-- are built without CONCURRENTLY and block writes to horses/riders while
-- they build (seconds for tens of thousands of rows; reads are not blocked).
-- Apply outside an import.
-- Safe to re-run (IF NOT EXISTS). Rollback: db/rollback/116_name_trgm.sql

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS horses_normalized_name_trgm_idx
  ON horses USING gin (normalized_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS riders_normalized_name_trgm_idx
  ON riders USING gin (normalized_name gin_trgm_ops);
