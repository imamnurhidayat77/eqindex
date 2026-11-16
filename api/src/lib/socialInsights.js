const crypto = require('crypto');

// Shared Meta insight helpers (Express routes + nightly script).
// Tokens stay ciphertext in social_accounts; only decrypted here, in memory.
function tokenKey() {
  return Buffer.from(process.env.SOCIAL_TOKEN_KEY || '', 'hex');
}

function encryptToken(plain) {
  const key = tokenKey();
  if (key.length !== 32) throw Object.assign(new Error('bad token key'), { status: 500 });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc.toString('hex')}`;
}

function decryptToken(enc) {
  const [ivH, tagH, dataH] = String(enc || '').split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', tokenKey(), Buffer.from(ivH, 'hex'));
  decipher.setAuthTag(Buffer.from(tagH, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataH, 'hex')), decipher.final()]).toString('utf8');
}

async function fetchIgInsights(remoteId, token) {
  const r = await fetch(`https://graph.facebook.com/v26.0/${remoteId}/insights`
    + `?metric=likes,comments,saved,shares,reach,views,reposts&period=lifetime&access_token=${encodeURIComponent(token)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || 'insights failed');
  const m = {};
  for (const d of j.data || []) m[d.name] = d.values?.[0]?.value ?? null;
  return m;
}

async function fetchFbSummary(remoteId, token) {
  // No /insights edge (needs read_insights, rejected as dialog scope) —
  // likes/comments/shares summaries are enough for a buyer dashboard.
  const r = await fetch(`https://graph.facebook.com/v26.0/${remoteId}`
    + `?fields=likes.summary(true),comments.summary(true)&access_token=${encodeURIComponent(token)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || 'insights failed');
  return {
    likes: j.likes?.summary?.total_count ?? null,
    comments: j.comments?.summary?.total_count ?? null,
    shares: null, // photo nodes expose no shares field; IG reels report it
  };
}

// Pull fresh numbers for one published post and upsert today's snapshot.
// Empty result = "not yet" (Meta lags ~48h), not zero — caller keeps old rows.
async function syncPost(pool, post, token) {
  const m = post.provider === 'ig'
    ? await fetchIgInsights(post.remote_media_id, token)
    : await fetchFbSummary(post.remote_media_id, token);
  await pool.query(
    `INSERT INTO social_insights (post_id, day, likes, comments, saved, shares, reach, views, reposts, raw)
     VALUES ($1, CURRENT_DATE, $2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (post_id, day) DO UPDATE SET likes=EXCLUDED.likes, comments=EXCLUDED.comments,
       saved=EXCLUDED.saved, shares=EXCLUDED.shares, reach=EXCLUDED.reach, views=EXCLUDED.views,
       reposts=EXCLUDED.reposts, raw=EXCLUDED.raw`,
    [post.id, m.likes ?? null, m.comments ?? null, m.saved ?? null, m.shares ?? null,
     m.reach ?? null, m.views ?? null, m.reposts ?? null, JSON.stringify(m)]);
  return m;
}

module.exports = { encryptToken, decryptToken, fetchIgInsights, fetchFbSummary, syncPost };
