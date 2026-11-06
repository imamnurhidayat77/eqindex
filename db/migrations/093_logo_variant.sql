-- 093: exact frontend template variant for the WYSIWYG logo bake.
-- logo_template stays the mapped backend id (corner|banner|top|minimal|
-- winner|bottombar) so discount matching keeps working; logo_variant holds
-- the exact SponsorTemplates.jsx variant id (banner-wave, winner-side, …)
-- the buyer picked. NULL = legacy purchase, baked by logo_template as before.
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS logo_variant TEXT;
