-- EQIndex Phase A (client spec v2 §4): second-round + jump-off results,
-- disqualification status, class metadata (number/format/sponsor/series/status).
-- Additive only.

-- ============ 1. Second round / jump-off on round_results ============
ALTER TABLE round_results ADD COLUMN IF NOT EXISTS round2_faults NUMERIC;
ALTER TABLE round_results ADD COLUMN IF NOT EXISTS round2_time_seconds NUMERIC;
ALTER TABLE round_results ADD COLUMN IF NOT EXISTS jumpoff_faults NUMERIC;
ALTER TABLE round_results ADD COLUMN IF NOT EXISTS jumpoff_time_seconds NUMERIC;
ALTER TABLE round_results ADD COLUMN IF NOT EXISTS prize_money NUMERIC;

-- ============ 2. Disqualification status (E/R/W/DQ) ============
ALTER TABLE round_results DROP CONSTRAINT IF EXISTS round_results_status_check;
ALTER TABLE round_results ADD CONSTRAINT round_results_status_check
  CHECK (status IN ('finished','eliminated','withdrawn','retired','disqualified'));

-- ============ 3. Class metadata ============
ALTER TABLE classes ADD COLUMN IF NOT EXISTS class_number INT;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS format TEXT;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS sponsor TEXT;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS series_key TEXT;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS result_status TEXT NOT NULL DEFAULT 'provisional'
  CHECK (result_status IN ('provisional','complete','official'));

-- Existing classes already carry full results → mark complete.
UPDATE classes SET result_status = 'complete'
WHERE id IN (SELECT DISTINCT class_id FROM round_results);
