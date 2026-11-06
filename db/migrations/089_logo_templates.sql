-- 089: buyer-chosen logo layout templates (Charles-approved).
-- corner: logos overlaid at fixed corners (default).
-- banner: photo on top, dark sponsor strip with centered logos below.
-- winner: cream side panel (event/class/WINNER/rider) + sponsor strip,
--   like the show-poster Charles shared.

ALTER TABLE purchases ADD COLUMN IF NOT EXISTS logo_template TEXT NOT NULL DEFAULT 'corner'
  CHECK (logo_template IN ('corner', 'banner', 'winner'));
