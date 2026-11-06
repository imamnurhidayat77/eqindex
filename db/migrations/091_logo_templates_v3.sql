-- 091: bottom-bar template (short dark strip, from the reference boards).
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_logo_template_check;
ALTER TABLE purchases ADD CONSTRAINT purchases_logo_template_check
  CHECK (logo_template IN ('corner', 'banner', 'top', 'minimal', 'winner', 'bottombar'));
