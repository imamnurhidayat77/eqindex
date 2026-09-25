-- Corrections inbox + series metadata — migration 017. Additive only.

-- Public correction reports (contact form) curated by admins.
CREATE TABLE IF NOT EXISTS correction_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT 'Correction',
  entity_type TEXT, -- horse|rider|event|class|result|other
  entity_id TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_review','resolved','rejected')),
  resolved_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS corrections_status_idx ON correction_reports (status);

-- Series metadata: qual rules + official vs independent label.
CREATE TABLE IF NOT EXISTS series_info (
  series_key TEXT PRIMARY KEY,
  display_name TEXT,
  description TEXT,
  qual_rules TEXT,
  is_official BOOLEAN NOT NULL DEFAULT FALSE,
  official_source TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
