-- 079: admin-curated pre-book listing. Three-state flag:
--   NULL  = auto (follows the date rule, exactly today's behaviour),
--   TRUE  = always listed in pre-book (pinned, even without results),
--   FALSE = never listed (hidden even when upcoming).

ALTER TABLE events ADD COLUMN IF NOT EXISTS prebook_open BOOLEAN;

CREATE INDEX IF NOT EXISTS events_prebook_open ON events (prebook_open);
