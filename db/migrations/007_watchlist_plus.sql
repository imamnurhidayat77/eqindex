-- EQIndex watchlist+ — migration 007
-- Watchlist grows beyond horse|rider: combinations (horse+rider pair) and
-- events become watchable. Alert preferences get their own table.
-- Existing horse|rider rows are untouched (entity_id stays, pair cols NULL).

ALTER TABLE watchlist_items DROP CONSTRAINT IF EXISTS watchlist_items_entity_type_check;
ALTER TABLE watchlist_items ALTER COLUMN entity_id DROP NOT NULL;
ALTER TABLE watchlist_items ADD COLUMN IF NOT EXISTS horse_id UUID REFERENCES horses(id) ON DELETE CASCADE;
ALTER TABLE watchlist_items ADD COLUMN IF NOT EXISTS rider_id UUID REFERENCES riders(id) ON DELETE CASCADE;
ALTER TABLE watchlist_items ADD CONSTRAINT watchlist_items_entity_type_check
  CHECK (entity_type IN ('horse','rider','combination','event'));
ALTER TABLE watchlist_items ADD CONSTRAINT watchlist_items_shape_check CHECK (
  (entity_type = 'combination' AND entity_id IS NULL AND horse_id IS NOT NULL AND rider_id IS NOT NULL)
  OR (entity_type IN ('horse','rider','event') AND entity_id IS NOT NULL AND horse_id IS NULL AND rider_id IS NULL)
);
ALTER TABLE watchlist_items DROP CONSTRAINT IF EXISTS watchlist_items_user_id_entity_type_entity_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS watchlist_single_uidx
  ON watchlist_items (user_id, entity_type, entity_id)
  WHERE entity_type IN ('horse','rider','event');
CREATE UNIQUE INDEX IF NOT EXISTS watchlist_combo_uidx
  ON watchlist_items (user_id, horse_id, rider_id)
  WHERE entity_type = 'combination';

-- ============ ALERT PREFERENCES ============
CREATE TABLE IF NOT EXISTS alert_prefs (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  score_changes BOOLEAN NOT NULL DEFAULT TRUE,
  ranking_movements BOOLEAN NOT NULL DEFAULT TRUE,
  new_results BOOLEAN NOT NULL DEFAULT TRUE,
  benchmark_changes BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
