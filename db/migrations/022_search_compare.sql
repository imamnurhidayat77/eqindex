-- EQIndex search & compare support — migration 022
-- Two-phase (and other jumping formats) live in classes.format, orthogonal
-- to class_type grade. NULL = unspecified (all legacy rows keep working).

ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_format_check;
ALTER TABLE classes ADD CONSTRAINT classes_format_check
  CHECK (format IS NULL OR format IN ('Two-phase', 'Jump-off', 'Speed', 'Power & Speed'));
