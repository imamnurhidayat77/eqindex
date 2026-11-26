-- Keyset paging for media lists (Studio library, event galleries, moments):
-- ORDER BY created_at DESC, id DESC with an optional event filter. Additive
-- and re-runnable; drop with db/rollback/118_media_keyset_idx.sql.
CREATE INDEX IF NOT EXISTS media_created_id ON media (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS media_event_created_id ON media (event_id, created_at DESC, id DESC);
