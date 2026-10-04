-- Rider categories as first-class reference data (migration 037).
-- Previously embedded in scoring_versions.params; promoted to their own table
-- so titles and matching rules are editable from a dedicated admin menu.
-- Weekend Best priority: rider's own category > class rider_category field >
-- these match rules. Titles render as-is (e.g. "Best Pro Rider").
CREATE TABLE IF NOT EXISTS rider_categories (
  key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  label TEXT NOT NULL,
  name_contains TEXT[] NOT NULL DEFAULT '{}',
  class_types TEXT[] NOT NULL DEFAULT '{}',
  exclude_name TEXT[] NOT NULL DEFAULT '{}',
  sort INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO rider_categories (key, title, label, name_contains, class_types, exclude_name, sort, is_active)
VALUES
  ('pro', 'Best Pro Rider', 'Pro Rider', '{}', '{Grand Prix,Premier,Open}', '{pony,junior,young rider,amateur,pro am}', 0, TRUE),
  ('young', 'Best Young Rider', 'Young Rider', '{young rider}', '{}', '{}', 1, TRUE),
  ('junior', 'Best Junior Rider', 'Junior Rider', '{junior}', '{}', '{}', 2, TRUE),
  ('amateur', 'Best Amateur', 'Amateur', '{amateur,pro am}', '{Amateur}', '{}', 3, TRUE),
  ('pony', 'Best Pony Rider', 'Pony Rider', '{pony}', '{}', '{}', 4, TRUE)
ON CONFLICT (key) DO NOTHING;
