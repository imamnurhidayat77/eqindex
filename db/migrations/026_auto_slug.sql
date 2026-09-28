-- Auto-fill slug from name when NULL ( dedup with short id suffix ).
CREATE OR REPLACE FUNCTION fill_slug() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL THEN
    NEW.slug := COALESCE(eq_slug(NEW.name), TG_TABLE_NAME || '-' || substr(NEW.id::TEXT, 1, 8));
    IF EXISTS (SELECT 1 FROM horses WHERE slug = NEW.slug AND TG_TABLE_NAME = 'horses' AND id <> NEW.id)
       OR EXISTS (SELECT 1 FROM riders WHERE slug = NEW.slug AND TG_TABLE_NAME = 'riders' AND id <> NEW.id)
       OR EXISTS (SELECT 1 FROM events WHERE slug = NEW.slug AND TG_TABLE_NAME = 'events' AND id <> NEW.id) THEN
      NEW.slug := NEW.slug || '-' || substr(NEW.id::TEXT, 1, 4);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS horses_slug_trg ON horses;
CREATE TRIGGER horses_slug_trg BEFORE INSERT ON horses FOR EACH ROW EXECUTE FUNCTION fill_slug();
DROP TRIGGER IF EXISTS riders_slug_trg ON riders;
CREATE TRIGGER riders_slug_trg BEFORE INSERT ON riders FOR EACH ROW EXECUTE FUNCTION fill_slug();
DROP TRIGGER IF EXISTS events_slug_trg ON events;
CREATE TRIGGER events_slug_trg BEFORE INSERT ON events FOR EACH ROW EXECUTE FUNCTION fill_slug();
