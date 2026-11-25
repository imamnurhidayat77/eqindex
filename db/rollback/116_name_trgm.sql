-- Rollback of 116_name_trgm.sql. Drops only the indexes: the pg_trgm
-- extension is left installed because other objects may depend on it.
-- The import keeps working without them (similar-name hints are skipped).
DROP INDEX IF EXISTS horses_normalized_name_trgm_idx;
DROP INDEX IF EXISTS riders_normalized_name_trgm_idx;
