-- 066: P3 privacy — photo opt-out per rider/horse (see docs/MASTER_PLAN.md P3).
-- photo_hidden hides the subject's photos from PUBLIC browsing surfaces
-- (catalog, strips, related) but never blocks: direct links, purchase,
-- owner watchlist (via ?mine=1 followership), library, or claimed shelf.
-- Takedown reuses correction_reports (no new table). Idempotent.

ALTER TABLE riders ADD COLUMN IF NOT EXISTS photo_hidden BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE horses ADD COLUMN IF NOT EXISTS photo_hidden BOOLEAN NOT NULL DEFAULT FALSE;
