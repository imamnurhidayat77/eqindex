-- Sire spelling aliases — migration 046.
-- horses.sire is free text; variants ("Euro Sport Centavos" vs
-- "Eurosport Centavos") split one sire into two rankings. Canonical
-- spelling lives on horses.sire; variants are recorded here for
-- provenance and resolved at import time (admin.js).
CREATE TABLE IF NOT EXISTS sire_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name TEXT NOT NULL,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (normalized_alias)
);
ALTER TABLE sire_aliases ENABLE ROW LEVEL SECURITY;

-- 2026-10: merge verified duplicates (case/space variants only)
UPDATE horses SET sire = 'Euro Sport Centavos' WHERE sire = 'Eurosport Centavos';
INSERT INTO sire_aliases (canonical_name, alias, normalized_alias)
VALUES ('Euro Sport Centavos', 'Eurosport Centavos', 'EUROSPORT CENTAVOS')
ON CONFLICT (normalized_alias) DO NOTHING;
UPDATE horses SET sire = 'Kannan' WHERE sire = 'KANNAN';
INSERT INTO sire_aliases (canonical_name, alias, normalized_alias)
VALUES ('Kannan', 'KANNAN', 'KANNAN')
ON CONFLICT (normalized_alias) DO NOTHING;
