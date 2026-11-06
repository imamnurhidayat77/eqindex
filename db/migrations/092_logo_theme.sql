-- 092: sponsor strip theme (light|dark) for the WYSIWYG bake.
-- Light (default) renders the white wave strip buyers see in the preview;
-- dark keeps the legacy dark strip. Pairs with 089 logo_template.

ALTER TABLE purchases ADD COLUMN IF NOT EXISTS logo_theme TEXT NOT NULL DEFAULT 'light'
  CHECK (logo_theme IN ('light', 'dark'));
