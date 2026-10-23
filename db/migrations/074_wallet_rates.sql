-- 074: wallet rate defaults (fractions of gross, admin-editable via
-- PATCH /admin/settings). 10 platform / 10 organizer / 80 photographer.

INSERT INTO admin_settings (key, value) VALUES ('platform_commission_rate', '0.10')
  ON CONFLICT (key) DO NOTHING;
INSERT INTO admin_settings (key, value) VALUES ('organizer_share_rate', '0.10')
  ON CONFLICT (key) DO NOTHING;
