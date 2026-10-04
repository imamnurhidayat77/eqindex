-- EQIndex scoring rules engine (Charles v0.3) — migration 035.
-- All numbers live in scoring_versions.params (JSONB), one ACTIVE row per
-- season. Code implements mechanics only; admin edits values via console.
-- Never UPDATE an active row mid-season: clone → edit draft → preview →
-- activate (old row becomes archived). Corrections under existing rules only.
CREATE TABLE IF NOT EXISTS scoring_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  label TEXT NOT NULL DEFAULT '',
  params JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at TIMESTAMPTZ,
  UNIQUE (season, version)
);
CREATE INDEX IF NOT EXISTS scoring_versions_season_idx ON scoring_versions (season, status);

-- World Cup is by designation, never height (§4, §7): a per-class flag.
ALTER TABLE classes ADD COLUMN IF NOT EXISTS is_world_cup BOOLEAN NOT NULL DEFAULT FALSE;

-- Seed v1 draft for 2026-2027 from Charles v0.3 defaults (draft, NOT active —
-- activate explicitly from Admin → Scoring after review).
INSERT INTO scoring_versions (season, version, status, label, params)
SELECT '2026-2027', 1, 'draft', 'v0.3 default rules',
'{"seasonStart": "08-01", "seasonEnd": "07-31",
  "divisions": [
    {"key": "development", "label": "Development", "min": null, "max": 100, "color": "#A0A0A0", "neutral": true},
    {"key": "copper", "label": "Copper", "min": 100, "max": 120, "color": "#B87333"},
    {"key": "bronze", "label": "Bronze", "min": 120, "max": 130, "color": "#CD7F32"},
    {"key": "silver", "label": "Silver", "min": 130, "max": 145, "color": "#C0C0C0"},
    {"key": "gold", "label": "Gold", "min": 145, "max": null, "color": "#FFD700"}
  ],
  "worldCup": {"key": "world_cup", "label": "World Cup", "color": "#8E7CFF"},
  "points": {"clear": 10, "doubleBonus": 5, "placing": [5, 4, 3, 2, 1], "classMax": 20, "singleRoundMax": 15, "twoPhaseMax": 15},
  "bestTen": {"n": 10, "minField": 3, "riderLimitPerClass": true},
  "status": {"clearRoute": 2, "consecutiveRoute": 3, "participationTop": 6, "participationWindow": 10, "stepDownPerSeason": 1},
  "awards": {"minStarts": 10, "tiebreakMinStarts": 5},
  "categories": [
    {"key": "pro", "label": "Pro Rider", "nameContains": [], "classTypes": ["Grand Prix", "Premier", "Open"], "excludeName": ["pony", "junior", "young rider", "amateur", "pro am"]},
    {"key": "young", "label": "Young Rider", "nameContains": ["young rider"], "classTypes": [], "excludeName": []},
    {"key": "junior", "label": "Junior Rider", "nameContains": ["junior"], "classTypes": [], "excludeName": []},
    {"key": "amateur", "label": "Amateur", "nameContains": ["amateur", "pro am"], "classTypes": ["Amateur"], "excludeName": []},
    {"key": "pony", "label": "Pony Rider", "nameContains": ["pony"], "classTypes": [], "excludeName": []}
  ]}'::JSONB
WHERE NOT EXISTS (SELECT 1 FROM scoring_versions WHERE season = '2026-2027');
