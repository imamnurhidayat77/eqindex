-- Rollback of 117_import_batches.sql. Removes undo history: imports made
-- after 117 can no longer be undone. Results themselves are untouched.
-- Deploy the API revision without import batches BEFORE running this, or
-- every commit will fail on the missing column.
DROP INDEX IF EXISTS round_results_import_batch_idx;
ALTER TABLE round_results DROP COLUMN IF EXISTS import_batch_id;
DROP TABLE IF EXISTS import_batches;
