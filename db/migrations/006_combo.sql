-- EQIndex combination compare — migration 006
ALTER TABLE saved_comparisons DROP CONSTRAINT IF EXISTS saved_comparisons_type_check;
ALTER TABLE saved_comparisons ADD CONSTRAINT saved_comparisons_type_check
  CHECK (type IN ('horse','rider','combination'));
-- composite pair ids ("horseId:riderId") don't fit UUID: widen to TEXT
ALTER TABLE saved_comparisons DROP CONSTRAINT IF EXISTS saved_comparisons_check;
ALTER TABLE saved_comparisons ALTER COLUMN a_id TYPE TEXT USING a_id::TEXT;
ALTER TABLE saved_comparisons ALTER COLUMN b_id TYPE TEXT USING b_id::TEXT;
ALTER TABLE saved_comparisons ADD CONSTRAINT saved_comparisons_different CHECK (a_id <> b_id);
