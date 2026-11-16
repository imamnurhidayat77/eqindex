-- 099: buyer posts made from BossMedia + per-day insights.
-- social_posts links an owned photo to the provider's media id returned at
-- post time (exact link even when the buyer edits the caption afterwards).
CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  purchase_id UUID REFERENCES purchases(id) ON DELETE SET NULL,
  provider TEXT NOT NULL CHECK (provider IN ('ig', 'fb_page')),
  remote_media_id TEXT NOT NULL UNIQUE,
  post_url TEXT,
  caption_used TEXT,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('queued', 'published', 'failed')),
  error TEXT,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS social_posts_user_idx ON social_posts (user_id, posted_at DESC);

-- One row per post per day (nightly upsert from the provider insights edge).
CREATE TABLE IF NOT EXISTS social_insights (
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  likes INT, comments INT, saved INT, shares INT, reach INT, views INT, reposts INT,
  raw JSONB,
  PRIMARY KEY (post_id, day)
);
