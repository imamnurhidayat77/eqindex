-- EQIndex elite features — migration 003
-- Watchlist + saved comparisons (mirrors equineintel Elite Hub MVP slice).
-- Scoped by user_id; full auth arrives later (until then: X-User-Id header, demo = seed admin).
-- Also opens 'PORDASI' as a legal source for the news/event-discovery scraper.

ALTER TABLE horse_aliases DROP CONSTRAINT IF EXISTS horse_aliases_source_check;
ALTER TABLE horse_aliases ADD CONSTRAINT horse_aliases_source_check
  CHECK (source IN ('FEI','EQUIPE','ESNZ','CSV','MANUAL','PORDASI'));

ALTER TABLE rider_aliases DROP CONSTRAINT IF EXISTS rider_aliases_source_check;
ALTER TABLE rider_aliases ADD CONSTRAINT rider_aliases_source_check
  CHECK (source IN ('FEI','EQUIPE','ESNZ','CSV','MANUAL','PORDASI'));

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_source_check;
ALTER TABLE events ADD CONSTRAINT events_source_check
  CHECK (source IN ('FEI','EQUIPE','ESNZ','CSV','MANUAL','PORDASI'));

ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_source_check;
ALTER TABLE classes ADD CONSTRAINT classes_source_check
  CHECK (source IN ('FEI','EQUIPE','ESNZ','CSV','MANUAL','PORDASI'));

ALTER TABLE raw_results DROP CONSTRAINT IF EXISTS raw_results_source_check;
ALTER TABLE raw_results ADD CONSTRAINT raw_results_source_check
  CHECK (source IN ('FEI','EQUIPE','ESNZ','CSV','MANUAL','PORDASI'));

ALTER TABLE round_results DROP CONSTRAINT IF EXISTS round_results_source_check;
ALTER TABLE round_results ADD CONSTRAINT round_results_source_check
  CHECK (source IN ('FEI','EQUIPE','ESNZ','CSV','MANUAL','PORDASI'));

-- ============ WATCHLIST ============
CREATE TABLE watchlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('horse','rider')),
  entity_id UUID NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, entity_type, entity_id)
);
CREATE INDEX watchlist_user_idx ON watchlist_items (user_id);

-- ============ SAVED COMPARISONS ============
CREATE TABLE saved_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('horse','rider')),
  a_id UUID NOT NULL,
  b_id UUID NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (a_id <> b_id)
);
CREATE INDEX saved_comparisons_user_idx ON saved_comparisons (user_id);
