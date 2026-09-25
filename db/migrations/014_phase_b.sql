-- EQIndex Phase B (client spec v2 §11): audit history for all material
-- changes + private/public watchlist visibility. Additive only.

-- ============ 1. Entity audit log ============
CREATE TABLE IF NOT EXISTS entity_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor TEXT NOT NULL DEFAULT 'anonymous',
  action TEXT NOT NULL, -- e.g. review.merge, claim.approve, training.create
  entity_type TEXT NOT NULL, -- horse|rider|event|class|result|watchlist|comparison|series|settings
  entity_id TEXT,
  detail JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS entity_audit_time_idx ON entity_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS entity_audit_entity_idx ON entity_audit (entity_type, entity_id);

-- ============ 2. Watchlist visibility (private default) ============
ALTER TABLE watchlist_items ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;
