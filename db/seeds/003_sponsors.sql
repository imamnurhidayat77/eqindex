-- Seed dummy: 1 sponsor + 1 logo + 1 event budget (validasi SPONSOR Fase 1)

-- Dev-only password: sponsor12345 (bcrypt, cost 12). Never use in staging/prod.
INSERT INTO users (id, name, email, role, password_hash) VALUES
  ('88888888-8888-8888-8888-888888888888', 'Seed Sponsor', 'sponsor@eqindex.local', 'SPONSOR',
   '$2b$12$DKUr6UqZOukfX.ZcoXO/8e4IAhGdfrrMHFLcgQ3J2oJWi7rTyn7Ve')
ON CONFLICT (id) DO NOTHING;

INSERT INTO sponsors (id, user_id, name, contact_email, website, is_active) VALUES
  ('99999999-9999-9999-9999-999999999999', '88888888-8888-8888-8888-888888888888',
   'Seed Brand', 'sponsor@eqindex.local', 'https://seedbrand.nz', true)
ON CONFLICT (id) DO NOTHING;

-- NOTE: no logo row here on purpose — logos need real bytes in R2.
-- Upload api/test-fixtures/sponsor-logo.png via POST /sponsor/logos.
-- Budget against the seed event from 001_dummy.sql when present
-- (50000 cents = NZ$500), else an any-event budget — never fail a fresh
-- database. discount starts at 0 on purpose: the sponsor sets it via the
-- dashboard, and buyers only see logos of sponsors funding a discount.
INSERT INTO sponsor_budgets (id, sponsor_id, event_id, agreed_cents, spent_cents, status, discount_cents)
SELECT 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '99999999-9999-9999-9999-999999999999',
  (SELECT id FROM events WHERE id = '44444444-4444-4444-4444-444444444444'),
  50000, 0, 'active', 0
ON CONFLICT (id) DO NOTHING;
