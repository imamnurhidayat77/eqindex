-- Per-class arena name (sponsored arena labels, e.g. "I-MED Radiology - Bayleys Indoor").
ALTER TABLE classes ADD COLUMN IF NOT EXISTS arena_name TEXT;
