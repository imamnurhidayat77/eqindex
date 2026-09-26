-- Rank movement tracking (briefing §7A): periodic points-rank snapshots.
CREATE TABLE IF NOT EXISTS ranking_snapshots (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('horse','rider')),
  entity_id UUID NOT NULL,
  period DATE NOT NULL DEFAULT CURRENT_DATE,
  rank INT NOT NULL,
  points INT NOT NULL DEFAULT 0,
  PRIMARY KEY (entity_type, entity_id, period)
);
CREATE INDEX IF NOT EXISTS snapshots_period_idx ON ranking_snapshots (entity_type, period DESC);
