-- 102: admin manual upload for community moments (the no-email fallback).
-- Same quarantine as email moments, different origin: source='admin' with
-- the uploading admin as uploader_user_id (accountability without an email).
-- Shop queries all filter source='studio', so no shop change is needed here —
-- only community-side reads widen from 'email' to ('email','admin').

ALTER TABLE media DROP CONSTRAINT IF EXISTS media_source_check;
ALTER TABLE media ADD CONSTRAINT media_source_check
  CHECK (source IN ('studio', 'email', 'web', 'admin'));
