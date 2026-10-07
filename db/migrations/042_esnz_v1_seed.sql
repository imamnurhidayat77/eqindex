-- Seed ESNZ 2026-27 ruleset (draft, NOT active) — Annex 11 v19.0.
-- Activate explicitly from Admin → Scoring after preview review.
-- scope 'series_only' = strict Charles (only series classes score).
-- Flip to 'all_classes' to score every class on its show-tier scale.

INSERT INTO scoring_versions (season, version, status, label, params)
SELECT '2026-2027', 3, 'draft', '2026-27 series rules (Annex 11 v19.0)',
jsonb_build_object('mode', 'esnz', 'esnz',
'{
  "scope": "series_only",
  "scales": {
    "grand_prix": [10, 8, 6, 4, 2, 1],
    "premier": [20, 17, 14, 11, 8, 4]
  },
  "placesCounted": 6,
  "zeroFaultThreshold": 12,
  "shareEqualPlacings": true,
  "defaultScale": "grand_prix",
  "youngHorse": {
    "enabled": true,
    "seriesKeys": ["young-horse-series", "five-yo-series", "six-yo-series"],
    "firstClear": 4,
    "doubleClearTotal": 6
  },
  "majorKinds": ["national_championship", "series_final", "islands", "hoy", "national_young_horse"],
  "series": {
    "premier-league-series": {
      "bestOf": null,
      "sliding": [[15,10],[14,9],[13,9],[12,8],[11,8],[10,7],[9,7],[8,6],[7,6],[6,5],[5,5],[4,4]],
      "scale": "premier",
      "multipliers": [
        {"eventKinds": ["national_championship"], "mult": 2.0},
        {"eventKinds": ["series_final", "hoy"], "mult": 1.5}
      ]
    },
    "grand-prix-series": {
      "bestOf": 12, "scale": "show_rating",
      "scaleOverride": [{"eventKinds": ["national_championship", "series_final", "hoy"], "scale": "premier"}]
    },
    "pony-grand-prix-series": {"bestOf": 12, "scale": "show_rating"},
    "young-rider-series": {"bestOf": 12, "scale": "show_rating"},
    "junior-rider-series": {"bestOf": 12, "scale": "show_rating"},
    "pro-am-series": {"bestOf": 12, "scale": "show_rating"},
    "amateur-rider-series": {
      "bestOf": 12, "scale": "grand_prix",
      "scaleOverride": [{"eventKinds": ["series_final", "national_championship", "islands", "hoy"], "scale": "premier"}]
    },
    "tertiary-series": {"bestOf": 6, "scale": "grand_prix"},
    "young-horse-series": {"bestOf": 7, "scale": "none", "majorScale": "grand_prix", "clearRound": true},
    "five-yo-series": {"bestOf": 7, "scale": "none", "majorScale": "grand_prix", "clearRound": true},
    "six-yo-series": {"bestOf": 7, "scale": "none", "majorScale": "grand_prix", "clearRound": true},
    "seven-yo-series": {
      "bestOf": 10, "scale": "grand_prix",
      "scaleOverride": [{"eventKinds": ["national_young_horse", "series_final", "islands", "national_championship", "hoy"], "scale": "premier"}]
    },
    "eight-yo-series": {"bestOf": 12, "scale": "show_rating", "sources": ["grand-prix-series", "premier-league-series"]},
    "top-mare-series": {"bestOf": 12, "scale": "show_rating", "sources": ["grand-prix-series", "premier-league-series"]},
    "stallion-series": {"bestOf": 12, "scale": "show_rating", "sources": ["grand-prix-series", "premier-league-series"]},
    "breeder-series": {"seasonTotal": true, "excludeSeries": ["eight-yo-series", "top-mare-series", "stallion-series"]}
  }
}'::JSONB)
WHERE NOT EXISTS (SELECT 1 FROM scoring_versions WHERE season = '2026-2027' AND version = 3);
