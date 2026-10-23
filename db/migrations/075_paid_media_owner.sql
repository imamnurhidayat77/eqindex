-- 075: hard guard against double-charging the same photo.
-- The owned-guard in checkout is check-then-insert: two concurrent checkouts
-- for the same photo can both pass the guard (neither is paid yet) and both
-- charge. This partial unique index makes the second commit fail instead;
-- the API maps 23505 on this index to a clean 409 "already own it".
-- NOTE: only direct photo purchases carry media_id (packages, reels and
-- credit bundles store NULL), and tier upgrades are already blocked by the
-- owned-guard, so no legitimate flow creates two paid rows here.
-- If this fails on existing duplicate rows, resolve them manually first
-- (refund one) and re-run.
CREATE UNIQUE INDEX IF NOT EXISTS purchases_paid_media_owner
  ON purchases (buyer_user_id, media_id)
  WHERE status = 'paid' AND media_id IS NOT NULL;
