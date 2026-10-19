-- 064: personal photo claims ("that's me" shelf).
-- Family decision: a claim NEVER writes the canonical horse_id/rider_id tag.
-- It only saves the photo into the claimant's own gallery (library "Claimed"
-- section) so they can find and buy it. Canonical tagging stays with the
-- photographer/admin via Media Library. Idempotent.

CREATE TABLE IF NOT EXISTS claimed_photos (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  claimed_horse_id UUID NULL REFERENCES horses(id),
  claimed_rider_id UUID NULL REFERENCES riders(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, media_id),
  CHECK (num_nonnulls(claimed_horse_id, claimed_rider_id) = 1)
);
CREATE INDEX IF NOT EXISTS claimed_photos_media ON claimed_photos (media_id);
