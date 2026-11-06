-- 090: two more buyer templates (reference boards): top banner strip
-- and a minimal translucent overlay. Corner positions stay buyer-chosen.
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_logo_template_check;
ALTER TABLE purchases ADD CONSTRAINT purchases_logo_template_check
  CHECK (logo_template IN ('corner', 'banner', 'top', 'minimal', 'winner'));
