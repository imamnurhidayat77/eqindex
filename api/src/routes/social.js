const crypto = require('crypto');
const pool = require('../db');
const { asyncH } = require('../lib/async');
const { needUser } = require('../lib/auth');
const { audit } = require('../lib/audit');
const { UUID_RE } = require('../lib/resolve');
const mediaStore = require('../lib/mediaStore');
const socialInsights = require('../lib/socialInsights');
const { ensureBrandedFile } = require('../lib/communityBrand');

// Community moments post free for everyone except sponsors, who must hold a
// paid sponsor repost licence first. Studio photos always need ownership.
function needsPaidLicence(isCommunity, role) {
  return !isCommunity || role === 'SPONSOR';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Buyer owns this media? Mirrors /api/media/:id/download entitlement.
async function ownsMedia(userId, mediaId) {
  const paid = await pool.query(
    `SELECT id FROM purchases WHERE status = 'paid' AND buyer_user_id = $2
     AND (media_id = $1 OR package_id IN (SELECT package_id FROM package_items WHERE media_id = $1))
     ORDER BY created_at DESC LIMIT 1`, [mediaId, userId]);
  if (paid.rows.length) return { ok: true, purchaseId: paid.rows[0].id };
  const credit = await pool.query(
    `SELECT 1 FROM credit_redemptions cr JOIN credit_bundles cb ON cb.id = cr.bundle_id
     LEFT JOIN purchases p2 ON p2.id = cb.purchase_id
     WHERE cb.buyer_user_id = $2 AND cr.media_id = $1
     AND (p2.status = 'paid' OR cb.purchase_id IS NULL) LIMIT 1`, [mediaId, userId]);
  if (credit.rows.length) return { ok: true, purchaseId: null };
  const reel = await pool.query(
    `SELECT 1 FROM reel_orders ro JOIN purchases p3 ON p3.id = ro.purchase_id
     WHERE p3.status = 'paid' AND p3.buyer_user_id = $2 AND ro.media_id = $1
     AND ro.status IN ('ready', 'delivered') LIMIT 1`, [mediaId, userId]);
  if (reel.rows.length) return { ok: true, purchaseId: null };
  return { ok: false, purchaseId: null };
}

// Licence check for the session user only (uid never comes from the client).
async function licenceStatus(uid, mediaId, owns = ownsMedia) {
  if (!UUID_RE.test(String(mediaId || ''))) return { status: 400, body: { error: 'bad media_id' } };
  const own = await owns(uid, mediaId);
  return { status: 200, body: { data: { owned: own.ok } } };
}

const TAG_RE = /^[a-z0-9._]{1,30}$/i;

async function igPublish(igId, token, imageUrl, caption, tags) {
  const base = 'https://graph.facebook.com/v26.0';
  const clean = (Array.isArray(tags) ? tags : []).map((t) => String(t || '').replace(/^@/, '').trim())
    .filter((t) => TAG_RE.test(t)).slice(0, 5);
  // Spread tags across the frame so they don't stack on one spot.
  const userTags = clean.map((username, i) => ({ username, x: (i + 1) / (clean.length + 1), y: 0.5 }));
  const mk = await fetch(`${base}/${igId}/media?image_url=${encodeURIComponent(imageUrl)}`
    + `&caption=${encodeURIComponent(caption)}`
    + (userTags.length ? `&user_tags=${encodeURIComponent(JSON.stringify(userTags))}` : '')
    + `&access_token=${encodeURIComponent(token)}`, { method: 'POST' });
  const container = await mk.json().catch(() => ({}));
  if (!mk.ok || !container.id) throw new Error((container.error && container.error.message) || 'instagram rejected the photo');
  for (let i = 0; i < 5; i++) {
    const stRes = await fetch(`${base}/${container.id}?fields=status_code&access_token=${encodeURIComponent(token)}`);
    const st = await stRes.json().catch(() => ({}));
    if (st.status_code === 'FINISHED') break;
    if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') throw new Error('instagram could not process the photo — try a JPEG under 8MB');
    await sleep(3000);
  }
  const pubRes = await fetch(`${base}/${igId}/media_publish?creation_id=${encodeURIComponent(container.id)}`
    + `&access_token=${encodeURIComponent(token)}`, { method: 'POST' });
  const pub = await pubRes.json().catch(() => ({}));
  if (!pubRes.ok || !pub.id) throw new Error((pub.error && pub.error.message) || 'instagram publish failed');
  const detRes = await fetch(`${base}/${pub.id}?fields=permalink&access_token=${encodeURIComponent(token)}`);
  const det = await detRes.json().catch(() => ({}));
  return { remoteId: String(pub.id), url: det.permalink || null };
}

const PROVIDERS = ['ig', 'fb_page'];
// shortcut: read_insights is rejected as a dialog scope on current API versions
// (kills the whole OAuth dialog); Page/IG insights are covered by
// pages_read_engagement / instagram_manage_insights on the token instead.
const SCOPES = {
  ig: ['instagram_basic', 'instagram_content_publish', 'instagram_manage_insights', 'pages_show_list', 'pages_read_engagement'],
  fb_page: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'],
};

function cfg() {
  return {
    appId: process.env.META_APP_ID || '',
    appSecret: process.env.META_APP_SECRET || '',
    redirect: process.env.META_REDIRECT_URI || '',
    tokenKey: process.env.SOCIAL_TOKEN_KEY || '',
  };
}

// shortcut: keep the state stateless (HMAC, 10 min expiry) so no extra table.
function signState(userId, provider) {
  const { appSecret } = cfg();
  const exp = Date.now() + 10 * 60e3;
  const payload = `${userId}.${provider}.${exp}`;
  const sig = crypto.createHmac('sha256', appSecret).update(payload).digest('hex');
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

function verifyState(state) {
  const { appSecret } = cfg();
  const raw = Buffer.from(String(state || ''), 'base64url').toString('utf8');
  const [userId, provider, exp, sig] = raw.split('.');
  if (!userId || !PROVIDERS.includes(provider) || !exp || !sig) return null;
  if (Number(exp) < Date.now()) return null;
  const expect = crypto.createHmac('sha256', appSecret).update(`${userId}.${provider}.${exp}`).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  return { userId, provider };
}

const encryptToken = socialInsights.encryptToken;
const decryptToken = socialInsights.decryptToken;
// NOTE: local decryptToken removed (now from lib/socialInsights).

module.exports = function mountSocialRoutes(app) {
  // List own connections — token never leaves the server.
  app.get('/api/my/social/accounts', asyncH(async (req, res) => {
    const uid = needUser(req, res); if (!uid) return;
    const { rows } = await pool.query(
      `SELECT id, provider, remote_id, name, expires_at, scopes, created_at
       FROM social_accounts WHERE user_id = $1 ORDER BY created_at DESC`, [uid]);
    res.json({ data: rows });
  }));

  // Build the Meta OAuth URL. Degrades to 501 until META_* is configured.
  app.get('/api/my/social/connect', asyncH(async (req, res) => {
    const uid = needUser(req, res); if (!uid) return;
    const provider = String(req.query.provider || '');
    if (!PROVIDERS.includes(provider)) return res.status(400).json({ error: 'need {provider: ig|fb_page}' });
    const { appId, appSecret, redirect } = cfg();
    if (!appId || !appSecret || !redirect) {
      return res.status(501).json({ error: 'social connect not configured — ask admin to set META_APP_ID / SECRET / REDIRECT_URI' });
    }
    const url = 'https://www.facebook.com/v26.0/dialog/oauth'
      + `?client_id=${encodeURIComponent(appId)}`
      + `&redirect_uri=${encodeURIComponent(redirect)}`
      + `&state=${encodeURIComponent(signState(uid, provider))}`
      + `&scope=${encodeURIComponent(SCOPES[provider].join(','))}`;
    res.json({ data: { url } });
  }));

  // Meta redirects here with ?code=&state=. Exchanges code for a long-lived
  // user token, then stores one row per Page / IG business account found.
  // (remote_id is always the asset id, never the user id.)
  app.get('/api/social/callback', asyncH(async (req, res) => {
    const { APP_URL } = require('../config');
    const back = (q) => res.redirect(303, `${APP_URL || ''}/account${q}`);
    const { appId, appSecret, redirect, tokenKey } = cfg();
    if (!appId || !appSecret || !redirect || !tokenKey) {
      return res.status(501).json({ error: 'social connect not configured' });
    }
    const v = verifyState(req.query.state);
    if (!v) return res.status(400).json({ error: 'bad or expired state — try connect again' });
    const code = String(req.query.code || '');
    if (!code) return res.status(400).json({ error: 'missing code' });
    const g = async (path, token) => {
      const r = await fetch(`https://graph.facebook.com/v26.0/${path}&access_token=${encodeURIComponent(token)}`);
      return r.json().catch(() => ({}));
    };
    const tokRes = await fetch('https://graph.facebook.com/v26.0/oauth/access_token'
      + `?client_id=${encodeURIComponent(appId)}`
      + `&redirect_uri=${encodeURIComponent(redirect)}`
      + `&client_secret=${encodeURIComponent(appSecret)}`
      + `&code=${encodeURIComponent(code)}`);
    const tok = await tokRes.json().catch(() => ({}));
    if (!tokRes.ok || !tok.access_token) return res.status(400).json({ error: 'could not finish connect — try again' });
    // Short-lived (~hours) -> long-lived (~60 days). Without this the
    // connection silently dies the same day.
    const longRes = await fetch('https://graph.facebook.com/v26.0/oauth/access_token'
      + `?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}`
      + `&client_secret=${encodeURIComponent(appSecret)}`
      + `&fb_exchange_token=${encodeURIComponent(tok.access_token)}`);
    const long = await longRes.json().catch(() => ({}));
    const userToken = long.access_token || tok.access_token;
    const me = await g('me?fields=id,name', userToken);
    if (!me.id) return res.status(400).json({ error: 'could not read profile — try again' });
    const pages = await g('me/accounts?fields=id,name,instagram_business_account{id,username}&limit=50', userToken);
    const rows = [];
    for (const p of pages.data || []) {
      if (v.provider === 'fb_page') rows.push(['fb_page', String(p.id), String(p.name || '').slice(0, 120)]);
      if (p.instagram_business_account?.id) {
        rows.push(['ig', String(p.instagram_business_account.id), String(p.instagram_business_account.username || '').slice(0, 120)]);
      }
    }
    // Provider filter: FB button stores pages, IG button stores IG accounts.
    const wanted = v.provider === 'ig' ? rows.filter(([pr]) => pr === 'ig') : rows.filter(([pr]) => pr === 'fb_page');
    if (!wanted.length) {
      return back(v.provider === 'ig'
        ? '/account?connect_error=noig'
        : '/account?connect_error=nopage');
    }
    const enc = encryptToken(userToken);
    for (const [pr, rid, nm] of wanted) {
      await pool.query(
        `INSERT INTO social_accounts (user_id, provider, remote_id, name, enc_token, scopes)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (user_id, provider, remote_id) DO UPDATE
         SET name = EXCLUDED.name, enc_token = EXCLUDED.enc_token, scopes = EXCLUDED.scopes`,
        [v.userId, pr, rid, nm, enc, SCOPES[pr]]);
    }
    audit(req, 'social.connect', 'social_account', wanted.map(([, r]) => r).join(','), { provider: v.provider });
    return back('/account?connected=1');
  }));

  // Does the logged-in user already hold a licence for this media? Lets the
  // moment page show Post (licensed sponsor) or Buy instead of both.
  app.get('/api/my/social/licence/:mediaId', asyncH(async (req, res) => {
    const uid = needUser(req, res); if (!uid) return;
    const out = await licenceStatus(uid, req.params.mediaId);
    res.status(out.status).json(out.body);
  }));

  // Post an owned photo. Returns the provider media id (exact link for tracking).
  app.post('/api/my/social/posts', asyncH(async (req, res) => {
    const uid = needUser(req, res); if (!uid) return;
    const { media_id, provider, caption, tags } = req.body || {};
    if (!UUID_RE.test(String(media_id || ''))) return res.status(400).json({ error: 'bad media_id' });
    if (!PROVIDERS.includes(provider)) return res.status(400).json({ error: 'need {provider: ig|fb_page}' });
    const text = String(caption || '').slice(0, 2200);
    // Tags only apply to Instagram (FB needs numeric IDs, not usernames).
    if (tags !== undefined && provider !== 'ig') {
      return res.status(400).json({ error: 'tags are Instagram-only for now' });
    }
    const m = await pool.query('SELECT * FROM media WHERE id = $1 AND status = $2', [media_id, 'published']);
    if (!m.rows.length) return res.status(404).json({ error: 'photo not found' });
    if (!m.rows[0].storage_key) return res.status(409).json({ error: 'original not stored yet' });
    const isCommunity = ['email', 'admin', 'web'].includes(m.rows[0].source) && m.rows[0].price_cents == null;
    const own = needsPaidLicence(isCommunity, req.authUser.role)
      ? await ownsMedia(uid, media_id) : { ok: true, purchaseId: null };
    if (!own.ok) {
      return res.status(402).json({ error: isCommunity
        ? 'Sponsors need the repost licence for this moment. Buy it on the moment page, then post.'
        : 'purchase required' });
    }
    const acct = await pool.query(
      'SELECT * FROM social_accounts WHERE user_id = $1 AND provider = $2 ORDER BY created_at DESC LIMIT 1',
      [uid, provider]);
    if (!acct.rows.length) return res.status(409).json({ error: 'connect your account first' });
    const day = await pool.query(
      "SELECT COUNT(*)::INT AS n FROM social_posts WHERE user_id = $1 AND provider = $2 AND posted_at > NOW() - INTERVAL '24 hours'",
      [uid, provider]);
    if (day.rows[0].n >= 90) return res.status(429).json({ error: 'daily post limit reached — try tomorrow' });
    let token;
    try { token = decryptToken(acct.rows[0].enc_token); }
    catch { return res.status(500).json({ error: 'could not read connection — reconnect your account' }); }
    // Post the same file the buyer owns: the baked sponsor design when the
    // purchase carries logos (library bakes it on first view), else original.
    // shortcut: an unbaked logo design posts nothing yet — the buyer opens the
    // library once to finish the bake, then posts. Upgrade: bake on demand here.
    const logoBuy = await pool.query(
      `SELECT p.id, p.logo_variant_key FROM purchases p
       WHERE p.status = 'paid' AND p.buyer_user_id = $2 AND p.media_id = $1
         AND EXISTS (SELECT 1 FROM purchase_sponsor_logos l WHERE l.purchase_id = p.id)
       ORDER BY p.created_at DESC LIMIT 1`,
      [media_id, uid]
    );
    // Community moments always leave with the Boss Media mark, never raw.
    let fileKey = isCommunity ? await ensureBrandedFile(m.rows[0]) : m.rows[0].storage_key;
    if (!fileKey) return res.status(409).json({ error: 'The branded file is still being prepared. Try again in a few minutes.' });
    let purchaseId = own.purchaseId;
    if (logoBuy.rows.length) {
      purchaseId = logoBuy.rows[0].id;
      if (logoBuy.rows[0].logo_variant_key) fileKey = logoBuy.rows[0].logo_variant_key;
      else return res.status(409).json({ error: 'open this photo in your library once to finish the sponsor design, then post' });
    }
    // Signed URL (15 min) is enough: Meta fetches the bytes immediately.
    const imageUrl = await mediaStore.signedDownloadUrl(fileKey, 900);
    try {
      let out;
      if (provider === 'ig') {
        out = await igPublish(acct.rows[0].remote_id, token, imageUrl, text, tags);
      } else {
        // Pages publish with a Page token, never the user token.
        const ptRes = await fetch(`https://graph.facebook.com/v26.0/${acct.rows[0].remote_id}`
          + `?fields=access_token&access_token=${encodeURIComponent(token)}`);
        const pt = await ptRes.json().catch(() => ({}));
        if (!ptRes.ok || !pt.access_token) throw new Error('could not get Page token — reconnect the Page');
        const pr = await fetch(`https://graph.facebook.com/v26.0/${acct.rows[0].remote_id}/photos`
          + `?url=${encodeURIComponent(imageUrl)}&caption=${encodeURIComponent(text)}`
          + `&access_token=${encodeURIComponent(pt.access_token)}`, { method: 'POST' });
        const pj = await pr.json().catch(() => ({}));
        if (!pr.ok || !pj.id) throw new Error((pj.error && pj.error.message) || 'facebook rejected the photo');
        out = { remoteId: String(pj.id), url: pj.post_id ? `https://www.facebook.com/${pj.post_id}` : null };
      }
      const ins = await pool.query(
        `INSERT INTO social_posts (user_id, media_id, purchase_id, provider, remote_media_id, post_url, caption_used)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, posted_at`,
        [uid, media_id, purchaseId, provider, out.remoteId, out.url, text || null]);
      audit(req, 'social.post', 'social_post', ins.rows[0].id, { provider, media_id });
      res.status(201).json({ data: { id: ins.rows[0].id, post_url: out.url, remote_media_id: out.remoteId } });
    } catch (e) {
      // shortcut: failures stay out of social_posts (only published rows live
      // there); the trail lives in entity_audit for debugging.
      audit(req, 'social.post.failed', 'media', media_id, { provider, error: String(e.message || e).slice(0, 300) });
      return res.status(502).json({ error: `post failed: ${String(e.message || e).slice(0, 200)}` });
    }
  }));

  // Buyer's posts with latest insight snapshot (signed thumbs resolved server-side).
  app.get('/api/my/social/posts', asyncH(async (req, res) => {
    const uid = needUser(req, res); if (!uid) return;
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const { rows } = await pool.query(
      `SELECT sp.*, h.name AS horse, r.name AS rider, ev.name AS event_name,
              m.thumb_key, m.preview_key, pu.logo_variant_key,
              li.likes, li.comments, li.saved, li.shares, li.reach, li.views, li.reposts, li.day AS insight_day
       FROM social_posts sp
       LEFT JOIN media m ON m.id = sp.media_id
       LEFT JOIN purchases pu ON pu.id = sp.purchase_id
       LEFT JOIN horses h ON h.id = m.horse_id
       LEFT JOIN riders r ON r.id = m.rider_id
       LEFT JOIN events ev ON ev.id = m.event_id
       LEFT JOIN LATERAL (SELECT * FROM social_insights WHERE post_id = sp.id ORDER BY day DESC LIMIT 1) li ON true
       WHERE sp.user_id = $1 AND sp.status = 'published' ORDER BY sp.posted_at DESC LIMIT $2`, [uid, limit]);
    for (const row of rows) {
      // Same file that was posted: the baked sponsor design when present.
      const key = row.logo_variant_key || row.thumb_key || row.preview_key;
      row.thumb_url = key ? await mediaStore.signedDownloadUrl(key, 900).catch(() => null) : null;
      delete row.thumb_key; delete row.preview_key; delete row.logo_variant_key;
    }
    // Sponsors baked into each post (via its purchase), for display + filter.
    try {
      const pids = [...new Set(rows.map((r) => r.purchase_id).filter(Boolean))];
      const byPid = {};
      if (pids.length) {
        const s = await pool.query(
          `SELECT l.purchase_id AS key, s.id, s.name FROM purchase_sponsor_logos l
           JOIN sponsor_logos sl ON sl.id = l.sponsor_logo_id JOIN sponsors s ON s.id = sl.sponsor_id
           WHERE l.purchase_id = ANY($1::UUID[]) ORDER BY l.position`,
          [pids]
        );
        for (const x of s.rows) (byPid[x.key] = byPid[x.key] || []).push({ id: x.id, name: x.name });
      }
      for (const row of rows) row.sponsors = byPid[row.purchase_id] || [];
    } catch { for (const row of rows) row.sponsors = []; }
    // 14-day daily series per post (one query) for sparklines + trend chart.
    if (rows.length) {
      const series = await pool.query(
        `SELECT post_id, day, likes, comments, saved, shares, reach, views FROM social_insights
         WHERE post_id = ANY($1::UUID[]) AND day > CURRENT_DATE - INTERVAL '14 days' ORDER BY day`,
        [rows.map((r) => r.id)]
      ).catch(() => ({ rows: [] }));
      const byPost = {};
      for (const s of series.rows) {
        (byPost[s.post_id] = byPost[s.post_id] || []).push({
          day: s.day instanceof Date ? s.day.toISOString().slice(0, 10) : String(s.day).slice(0, 10),
          likes: s.likes, comments: s.comments, saved: s.saved,
          shares: s.shares, reach: s.reach, views: s.views,
        });
      }
      for (const row of rows) row.series = byPost[row.id] || [];
    }
    res.json({ data: rows });
  }));

  // Pull fresh insights for the buyer's own posts right now (same upsert as
  // the nightly script; same-day rows are overwritten, never duplicated).
  const lastRefresh = new Map();
  app.post('/api/my/social/insights/refresh', asyncH(async (req, res) => {
    const uid = needUser(req, res); if (!uid) return;
    if (Date.now() - (lastRefresh.get(uid) || 0) < 60000) {
      return res.status(429).json({ error: 'wait a minute before refreshing again' });
    }
    lastRefresh.set(uid, Date.now());
    const { rows } = await pool.query(
      `SELECT sp.id, sp.provider, sp.remote_media_id, sa.enc_token FROM social_posts sp
       JOIN social_accounts sa ON sa.user_id = sp.user_id AND sa.provider = sp.provider
       WHERE sp.user_id = $1 AND sp.status = 'published' AND sp.posted_at > NOW() - INTERVAL '90 days'`,
      [uid]
    );
    let ok = 0, failed = 0;
    for (const p of rows) {
      try {
        await socialInsights.syncPost(pool, p, decryptToken(p.enc_token));
        ok++;
      } catch { failed++; }
    }
    audit(req, 'social.insights.refresh', 'user', uid, { ok, failed });
    res.json({ data: { ok, failed } });
  }));

  app.post('/api/my/social/disconnect', asyncH(async (req, res) => {
    const uid = needUser(req, res); if (!uid) return;
    const { provider, remote_id } = req.body || {};
    if (!PROVIDERS.includes(provider) || !remote_id) {
      return res.status(400).json({ error: 'need {provider, remote_id}' });
    }
    await pool.query('DELETE FROM social_accounts WHERE user_id = $1 AND provider = $2 AND remote_id = $3',
      [uid, provider, String(remote_id)]);
    audit(req, 'social.disconnect', 'social_account', String(remote_id), { provider });
    res.json({ data: { ok: true } });
  }));
};
module.exports.needsPaidLicence = needsPaidLicence;
module.exports.licenceStatus = licenceStatus;
