-- One sire = one spelling, on EVERY write path (CSV import, EvoEvents
-- ingest, admin edits). 046 only resolved aliases inside the CSV import, so
-- "Eurosport Centavos" came back via other paths and Stallions showed one
-- sire as several rows.
-- 1. sire_key(): letters + digits only, lower case ("Cornet’s Air" = "cornetsair").
-- 2. canonical_sire(): explicit alias first, else the spelling most horses
--    already use for the same key, else the input trimmed.
-- 3. Trigger on horses applies it to every insert/update of sire.
-- 4. Cleans existing rows. Old values are kept in sire_cleanup_log for undo:
--    UPDATE horses h SET sire = l.old_sire FROM sire_cleanup_log l WHERE l.horse_id = h.id;
-- Safe to re-run.

CREATE OR REPLACE FUNCTION sire_key(t TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(regexp_replace(lower(COALESCE(t, '')), '[^a-z0-9]', '', 'g'), '');
$$;

CREATE INDEX IF NOT EXISTS horses_sire_key_idx ON horses (sire_key(sire));

CREATE OR REPLACE FUNCTION canonical_sire(t TEXT) RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN sire_key(t) IS NULL THEN NULLIF(btrim(t), '') ELSE COALESCE(
    (SELECT a.canonical_name FROM sire_aliases a
      WHERE sire_key(a.alias) = sire_key(t) OR sire_key(a.canonical_name) = sire_key(t)
      ORDER BY (sire_key(a.alias) = sire_key(t)) DESC LIMIT 1),
    (SELECT h.sire FROM horses h WHERE sire_key(h.sire) = sire_key(t)
      GROUP BY h.sire ORDER BY COUNT(*) DESC, h.sire LIMIT 1),
    regexp_replace(btrim(t), '\s+', ' ', 'g')) END;
$$;

CREATE OR REPLACE FUNCTION horses_canonical_sire_trg() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sire IS NOT NULL THEN NEW.sire := canonical_sire(NEW.sire); END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS horses_canonical_sire ON horses;
CREATE TRIGGER horses_canonical_sire BEFORE INSERT OR UPDATE OF sire ON horses
  FOR EACH ROW EXECUTE FUNCTION horses_canonical_sire_trg();

-- Reviewed spellings (2026-11-25). Variants differ only in case, spacing,
-- apostrophes or the Euro Sport stud prefix. Plain "Centavos" is folded in
-- too (Imam confirmed 2026-11-25: same NZ stallion, Encore was bred by Euro
-- Sport Horses).
INSERT INTO sire_aliases (canonical_name, alias, normalized_alias) VALUES
  ('Euro Sport Centavos', 'Centavos', 'CENTAVOS'),
  ('Euro Sport Centavos', 'ES Centavos', 'ES CENTAVOS'),
  ('Euro Sport Centavos', 'Euro Sports Centavos', 'EURO SPORTS CENTAVOS'),
  ('Euro Sport Diamant B', 'Eurosport Diamant B', 'EUROSPORT DIAMANT B'),
  ('Euro Sport Dimero NNZ', 'Eurosport Dimero NNZ', 'EUROSPORT DIMERO NNZ'),
  ('Euro Sport Kalaska', 'Eurosport Kalaska', 'EUROSPORT KALASKA'),
  ('Bling du Rouet', 'Bling Du Rouet', 'BLING DU ROUET'),
  ('Capatino GNZ', 'capatino GNZ', 'CAPATINO GNZ'),
  ('Centarion', 'CENTARION', 'CENTARION'),
  ('Chacco Silver', 'Chacco silver', 'CHACCO SILVER'),
  ('Cornet''s Air', 'Cornets Air', 'CORNETS AIR'),
  ('Double J Repicharge', 'DOUBLE J REPICHARGE', 'DOUBLE J REPICHARGE'),
  ('Fetiche du Pas', 'Fetiche Du Pas', 'FETICHE DU PAS'),
  ('GT Jake', 'G.T Jake', 'G.T JAKE'),
  ('Hector van d''Abdijhoeve', 'Hector van D''Abdijhoeve', 'HECTOR VAN D''ABDIJHOEVE'),
  ('Kizzy''s Affair', 'Kizzys Affair', 'KIZZYS AFFAIR'),
  ('Pezetas du Rouet', 'Pezetas Du Rouet', 'PEZETAS DU ROUET'),
  ('Roc de Cambes', 'Roc De Cambes', 'ROC DE CAMBES'),
  ('Ulhan du Temple', 'Ulhan Du Temple', 'ULHAN DU TEMPLE')
ON CONFLICT (normalized_alias) DO NOTHING;

-- "Euro Sport Dimero NN Z" needs no row: its key equals the canonical's.

CREATE TABLE IF NOT EXISTS sire_cleanup_log (
  horse_id UUID PRIMARY KEY,
  old_sire TEXT,
  new_sire TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE sire_cleanup_log ENABLE ROW LEVEL SECURITY;

-- Compute targets first (so one row's fix can't change another's pick),
-- log, then update. Only rows whose spelling actually changes.
CREATE TEMP TABLE _sire_fix ON COMMIT DROP AS
  SELECT id AS horse_id, sire AS old_sire, canonical_sire(sire) AS new_sire
  FROM horses WHERE sire IS NOT NULL AND canonical_sire(sire) IS DISTINCT FROM sire;
INSERT INTO sire_cleanup_log (horse_id, old_sire, new_sire)
  SELECT horse_id, old_sire, new_sire FROM _sire_fix
  ON CONFLICT (horse_id) DO NOTHING;
UPDATE horses h SET sire = f.new_sire FROM _sire_fix f WHERE h.id = f.horse_id;
