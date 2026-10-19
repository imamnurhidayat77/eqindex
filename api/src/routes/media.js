const express = require('express');
const pool = require('../db');
const { asyncH } = require('../lib/async');
const { EMAIL_RE, needRole, throttled } = require('../lib/auth');
const { audit } = require('../lib/audit');
const { resolveId } = require('../lib/resolve');
const multer = require('multer');
const sharp = require('sharp');
const mediaStore = require('../lib/mediaStore');

const stripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    const err = new Error('checkout unavailable — payments not configured yet');
    err.status = 503;
    throw err;
  }
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
};

// Photo platform P1: upload + renditions + assisted tagging + review queue.
// See docs/PHOTO_PLATFORM_PLAN.md §4–§5.

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 20 },
});

const PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const REEL_MIMES = ['video/mp4', 'video/quicktime', 'video/webm'];

const escXml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function watermarkSvg(w, h, text) {
  // Dense diagonal tiles across the whole frame (corner-only marks get
  // cropped) at an opacity that survives casual AI cleaners (~0.36) without
  // ruining the sales appeal. Baked into pixels at upload — not strippable.
  const size = Math.max(30, Math.round(Math.min(w, h) / 10));
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><pattern id="wm" width="260" height="100" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)">` +
    `<text x="8" y="52" font-family="sans-serif" font-size="${size}" font-weight="bold" fill="white" fill-opacity="0.36">${escXml(text)}</text>` +
    `</pattern></defs><rect width="${w}" height="${h}" fill="url(#wm)"/></svg>`
  );
}

async function activePhotographer(poolQ, id) {
  if (id) {
    const r = await poolQ.query('SELECT * FROM photographers WHERE id = $1 AND is_active', [id]);
    if (r.rows.length) return r.rows[0];
    const err = new Error('photographer not found or inactive');
    err.status = 404;
    throw err;
  }
  const r = await poolQ.query('SELECT * FROM photographers WHERE is_active ORDER BY created_at LIMIT 1');
  if (!r.rows.length) {
    const err = new Error('no active photographer (seed one first)');
    err.status = 409;
    throw err;
  }
  return r.rows[0];
}

module.exports = function mountMediaRoutes(app) {
  // ---- Upload batch (photos get 3 renditions; reels store original only) ----
  app.post('/admin/media/upload', needRole('ADMIN'), upload.array('files', 20), asyncH(async (req, res) => {
    const photographer = await activePhotographer(pool, req.body?.photographer_id);
    const eventId = req.body?.event_id || null;
    if (eventId) {
      const ev = await pool.query('SELECT id FROM events WHERE id = $1', [eventId]);
      if (!ev.rows.length) return res.status(404).json({ error: 'event not found' });
    }
    if (!req.files?.length) return res.status(400).json({ error: 'need files[] (multipart, ≤15MB each, ≤20)' });
    const out = [];
    for (const f of req.files) {
      const isPhoto = PHOTO_MIMES.includes(f.mimetype);
      const isReel = REEL_MIMES.includes(f.mimetype);
      if (!isPhoto && !isReel) {
        out.push({ file: f.originalname, ok: false, error: `unsupported type ${f.mimetype}` });
        continue;
      }
      const kind = isPhoto ? 'photo' : 'reel';
      const ext = (f.originalname.split('.').pop() || (isPhoto ? 'jpg' : 'mp4')).toLowerCase().slice(0, 8);
      const { rows } = await pool.query(
        `INSERT INTO media (photographer_id, event_id, kind, status) VALUES ($1, $2, $3, 'draft') RETURNING id`,
        [photographer.id, eventId, kind]
      );
      const id = rows[0].id;
      try {
        const origKey = mediaStore.keyFor('originals', eventId, id, ext);
        await mediaStore.putBuffer(origKey, f.buffer, f.mimetype);
        const patch = { storage_key: origKey };
        if (isPhoto) {
          const meta = await sharp(f.buffer).metadata();
          // Display sizes are deliberately NOT HD: the 1024px preview is
          // enough to judge sharpness/expression (what sells), not to print.
          // Originals never go public — only via paid signed URLs.
          const pvW = 1024;
          const pvH = Math.round(pvW * (meta.height || 1000) / (meta.width || 1600));
          const wm = watermarkSvg(pvW, pvH, `${photographer.name} • EQINDEX PREVIEW`);
          const thumb = await sharp(f.buffer).rotate().resize({ width: 480, withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
          const preview = await sharp(f.buffer).rotate().resize({ width: pvW, withoutEnlargement: true })
            .composite([{ input: wm, blend: 'over' }]).jpeg({ quality: 68 }).toBuffer();
          patch.thumb_key = mediaStore.keyFor('thumbs', eventId, id, 'jpg');
          patch.preview_key = mediaStore.keyFor('previews', eventId, id, 'jpg');
          await mediaStore.putBuffer(patch.thumb_key, thumb, 'image/jpeg');
          await mediaStore.putBuffer(patch.preview_key, preview, 'image/jpeg');
          patch.width = meta.width || null;
          patch.height = meta.height || null;
        }
        const cols = Object.keys(patch);
        await pool.query(
          `UPDATE media SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1`,
          [id, ...cols.map((c) => patch[c])]
        );
        audit(req, 'media.upload', 'media', id, { file: f.originalname, kind, event_id: eventId });
        out.push({ file: f.originalname, ok: true, id, kind });
      } catch (e) {
        await pool.query(`UPDATE media SET status = 'archived' WHERE id = $1`, [id]);
        out.push({ file: f.originalname, ok: false, error: e.message });
      }
    }
    res.status(201).json({ data: out });
  }));

  // ---- Direct video upload (P2B): browser -> R2 -> finalize ----
  // Photos keep the multipart path above. Videos bypass the API/proxy
  // entirely (Vercel proxy ~30s limit can't carry 50–200MB): the browser
  // PUTs bytes straight to R2, then calls finalize, which streams the object
  // back through ffmpeg (never fully buffered) and renders poster + teaser.
  // DEPLOY: R2 bucket needs a CORS rule allowing PUT from the web origin.
  const REEL_MAX_BYTES = 200 * 1024 * 1024;

  app.post('/admin/media/upload-url', needRole('ADMIN'), asyncH(async (req, res) => {
    const b = req.body || {};
    const mimetype = String(b.mimetype || '');
    if (!REEL_MIMES.includes(mimetype)) {
      return res.status(400).json({ error: 'upload-url is for video only (mp4/mov/webm)' });
    }
    const size = Number(b.size_bytes);
    if (!Number.isFinite(size) || size <= 0 || size > REEL_MAX_BYTES) {
      return res.status(400).json({ error: 'size_bytes must be 1–200MB' });
    }
    const photographer = await activePhotographer(pool, b.photographer_id);
    let eventId = null;
    if (b.event_id) {
      const ev = await pool.query('SELECT id FROM events WHERE id = $1', [String(b.event_id)]);
      if (!ev.rows.length) return res.status(404).json({ error: 'event not found' });
      eventId = String(b.event_id);
    }
    const ext = (String(b.filename || 'video.mp4').split('.').pop() || 'mp4').toLowerCase().slice(0, 8);
    const { rows } = await pool.query(
      `INSERT INTO media (photographer_id, event_id, kind, status) VALUES ($1, $2, 'reel', 'draft') RETURNING id`,
      [photographer.id, eventId]
    );
    const id = rows[0].id;
    const origKey = mediaStore.keyFor('originals', eventId, id, ext);
    await pool.query('UPDATE media SET storage_key = $2 WHERE id = $1', [id, origKey]);
    const uploadUrl = await mediaStore.presignedPutUrl(origKey, mimetype);
    audit(req, 'media.upload-url', 'media', id, { mimetype, size_bytes: size });
    res.status(201).json({ data: { media_id: id, upload_url: uploadUrl, max_bytes: REEL_MAX_BYTES } });
  }));

  // Single admin media row (finalize polling target).
  app.get('/admin/media/:id', needRole('ADMIN'), asyncH(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM media WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'media not found' });
    const r = rows[0];
    try {
      if (r.preview_key) r.preview_url = mediaStore.publicUrl(r.preview_key);
      if (r.thumb_key) r.thumb_url = mediaStore.publicUrl(r.thumb_key);
    } catch { /* R2 public base unconfigured */ }
    res.json({ data: r });
  }));

  // Render poster + watermarked teaser for an uploaded reel. Returns 202
  // immediately and works in the background (transcodes take minutes — far
  // beyond any proxy timeout); the upload page polls GET /admin/media/:id
  // until thumb_key appears. Safe to retry: skips when already done.
  app.post('/admin/media/:id/finalize', needRole('ADMIN'), asyncH(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM media WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'media not found' });
    const m = rows[0];
    if (m.kind !== 'reel') return res.status(400).json({ error: 'finalize is for reels only' });
    if (m.thumb_key && m.preview_key) return res.status(200).json({ data: { media_id: m.id, done: true } });
    if (!m.storage_key) return res.status(409).json({ error: 'no uploaded original yet (PUT to the upload URL first)' });
    const head = await mediaStore.headKey(m.storage_key).catch(() => null);
    if (!head) return res.status(409).json({ error: 'original not found in storage yet' });
    if (head.size > REEL_MAX_BYTES) return res.status(413).json({ error: 'file exceeds 200MB' });
    setImmediate(() => finalizeReel(m.id).catch((e) => console.error('[finalize] failed:', e.message)));
    res.status(202).json({ data: { media_id: m.id, processing: true } });
  }));

  async function finalizeReel(mediaId) {
    const os = require('node:os');
    const path = require('node:path');
    const fs = require('node:fs');
    const { probeDims, renderPreview, renderPoster } = require('../lib/reelProcess');
    const { rows } = await pool.query('SELECT * FROM media WHERE id = $1', [mediaId]);
    const m = rows[0];
    if (!m || m.thumb_key) return; // done or gone
    const ev = await pool.query('SELECT name FROM events WHERE id = $1', [m.event_id]).catch(() => ({ rows: [] }));
    const photographer = await pool.query('SELECT name FROM photographers WHERE id = $1', [m.photographer_id])
      .catch(() => ({ rows: [] }));
    // 1. Probe dimensions (fresh stream; the probe kills its input early).
    const s1 = await mediaStore.getStream(m.storage_key);
    const dims = await probeDims(s1.stream);
    const pvH = Math.max(2, Math.round((640 * dims.height) / Math.max(1, dims.width)));
    // 2. Watermark tile PNG (same diagonal style as photo previews).
    const wmPng = await sharp(watermarkSvg(640, pvH, `${photographer.rows[0]?.name || 'EQINDEX'} • EQINDEX PREVIEW`))
      .png().toBuffer();
    const wmPath = path.join(os.tmpdir(), `eqindex-wm-${mediaId}.png`);
    await fs.promises.writeFile(wmPath, wmPng);
    try {
      // 3. Preview transcode (fresh stream; only small outputs buffered).
      const s2 = await mediaStore.getStream(m.storage_key);
      const preview = await renderPreview(s2.stream, wmPath);
      const poster = await renderPoster(preview.buffer);
      const thumbKey = mediaStore.keyFor('thumbs', m.event_id, m.id, 'jpg');
      const previewKey = mediaStore.keyFor('previews', m.event_id, m.id, 'mp4');
      await mediaStore.putBuffer(thumbKey, poster, 'image/jpeg');
      await mediaStore.putBuffer(previewKey, preview.buffer, 'video/mp4');
      await pool.query(
        `UPDATE media SET thumb_key = $2, preview_key = $3, width = $4, height = $5 WHERE id = $1`,
        [m.id, thumbKey, previewKey, dims.width, dims.height]
      );
      audit({ authUser: { name: 'job', id: 'finalize' }, body: {}, query: {} },
        'media.finalize', 'media', m.id,
        { width: dims.width, height: dims.height, event: ev.rows[0]?.name || null });
    } finally {
      await fs.promises.unlink(wmPath).catch(() => {});
    }
  }

  // ---- Review queue ----
  app.get('/admin/media', needRole('ADMIN'), asyncH(async (req, res) => {
    const conds = [], params = [];
    const push = (sql, v) => { params.push(v); conds.push(sql.replace('?', `$${params.length}`)); };
    if (req.query.status) push('m.status = ?', String(req.query.status));
    if (req.query.event_id) push('m.event_id = ?', String(req.query.event_id));
    if (req.query.horse_id) {
      const hid = await resolveId('horses', req.query.horse_id, res);
      if (!hid) return;
      push('m.horse_id = ?', hid);
    }
    if (req.query.rider_id) {
      const rid = await resolveId('riders', req.query.rider_id, res);
      if (!rid) return;
      push('m.rider_id = ?', rid);
    }
    if (req.query.kind) push('m.kind = ?', String(req.query.kind));
    if (req.query.untagged === '1') conds.push('(m.horse_id IS NULL OR m.rider_id IS NULL)');
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    params.push(limit);
    const { rows } = await pool.query(
      `SELECT m.*, e.name AS event_name, h.name AS horse, r.name AS rider, c.name AS class_name
        FROM media m LEFT JOIN events e ON e.id = m.event_id
        LEFT JOIN horses h ON h.id = m.horse_id LEFT JOIN riders r ON r.id = m.rider_id
        LEFT JOIN classes c ON c.id = m.class_id
        ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
        ORDER BY m.created_at DESC LIMIT $${params.length}`,
      params
    );
    for (const r of rows) {
      try {
        if (r.preview_key) r.preview_url = mediaStore.publicUrl(r.preview_key);
        if (r.thumb_key) r.thumb_url = mediaStore.publicUrl(r.thumb_key);
      } catch { /* R2 public base unconfigured — URLs resolve after setup */ }
    }
    res.json({ data: rows });
  }));

  app.patch('/admin/media/:id', needRole('ADMIN'), asyncH(async (req, res) => {
    const b = req.body || {};
    const sets = [], vals = [];
    // $1 is the media id (params are [id, ...vals]), so columns start at $2.
    const set = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length + 1}`); };
    if (b.event_id !== undefined) {
      if (b.event_id) {
        const ev = await pool.query('SELECT id FROM events WHERE id = $1', [b.event_id]);
        if (!ev.rows.length) return res.status(404).json({ error: 'event not found' });
      }
      set('event_id', b.event_id || null);
    }
    if (b.class_id !== undefined) set('class_id', b.class_id || null);
    if (b.horse_id !== undefined) {
      set('horse_id', b.horse_id ? await resolveId('horses', b.horse_id, res) : null);
      if (b.horse_id && !vals[vals.length - 1]) return;
    }
    if (b.rider_id !== undefined) {
      set('rider_id', b.rider_id ? await resolveId('riders', b.rider_id, res) : null);
      if (b.rider_id && !vals[vals.length - 1]) return;
    }
    // Per-photo price overrides are retired (migration 059, tier-only
    // pricing) — silently ignore legacy clients still sending the field.
    if (b.license_default !== undefined) set('license_default', b.license_default || null);
    if (b.moment !== undefined) {
      if (b.moment !== null && !['win', 'clear', 'debut', 'pb'].includes(b.moment)) {
        return res.status(400).json({ error: 'moment must be win|clear|debut|pb' });
      }
      set('moment', b.moment);
    }
    if (b.status !== undefined) {
      if (!['draft', 'published', 'archived'].includes(b.status)) {
        return res.status(400).json({ error: 'status must be draft|published|archived' });
      }
      if (b.status === 'published') {
        const cur = await pool.query('SELECT event_id FROM media WHERE id = $1', [req.params.id]);
        const evId = b.event_id !== undefined ? (b.event_id || null) : cur.rows[0]?.event_id;
        if (!evId) return res.status(409).json({ error: 'publish needs an event (publish-gate)' });
      }
      set('status', b.status);
    }
    if (!sets.length) return res.status(400).json({ error: 'nothing to update' });
    const { rows } = await pool.query(
      `UPDATE media SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, [req.params.id, ...vals]);
    if (!rows.length) return res.status(404).json({ error: 'media not found' });
    audit(req, 'media.edit', 'media', req.params.id, { fields: sets.map((s) => s.split(' = ')[0]) });
    const final = rows[0];
    // Publish side-effects (P1b): auto-packages absorb newly published photos
    // (Sportograf-style post-purchase matching), buyers + watchers get one
    // digested in-app notification each (never one row per photo).
    if (final.status === 'published') {
      try {
        await refreshAutoPackages(pool, final);
        if (b.status === 'published') {
          await notifyPublish(pool, final);
        }
      } catch (e) { console.error('[media.publish-hook] non-fatal:', e.message); }
    }
    res.json({ data: rows[0] });
  }));

  // Insert a published photo into every matching auto package
  // (same event × same horse and/or same rider). Idempotent.
  async function refreshAutoPackages(poolQ, media) {
    if (!media.event_id || (!media.horse_id && !media.rider_id)) return [];
    const { rows } = await poolQ.query(
      `SELECT id FROM packages
        WHERE status = 'published' AND auto = true AND event_id = $1
          AND ((horse_id IS NOT NULL AND horse_id = $2)
            OR (rider_id IS NOT NULL AND rider_id = $3))`,
      [media.event_id, media.horse_id, media.rider_id]
    );
    for (const p of rows) {
      await poolQ.query(
        'INSERT INTO package_items (package_id, media_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [p.id, media.id]
      );
    }
    return rows.map((r) => r.id);
  }

  // One digested notification per user per ref (upsert): bulk publishing 500
  // photos still yields a single unread row ("N new photos…").
  async function upsertNotif(poolQ, userId, kind, refKey, title, body, link) {
    await poolQ.query(
      `INSERT INTO notifications (user_id, kind, title, body, link, ref_key, count)
        VALUES ($1, $2, $3, $4, $5, $6, 1)
        ON CONFLICT (user_id, kind, ref_key) DO UPDATE SET
          count = notifications.count + 1,
          body = $4 || ' (' || (notifications.count + 1) || ' new)',
          updated_at = NOW(), read_at = NULL`,
      [userId, kind, title, body, link, refKey]
    );
  }

  async function notifyPublish(poolQ, media) {
    // 1. Buyers of affected auto packages ("your bundle grew").
    const pkgs = await poolQ.query(
      `SELECT pk.id, pk.title FROM packages pk
        JOIN package_items pi ON pi.package_id = pk.id AND pi.media_id = $1
        WHERE pk.auto = true AND pk.status = 'published'`,
      [media.id]
    );
    for (const pk of pkgs.rows) {
      const buyers = await poolQ.query(
        `SELECT DISTINCT buyer_user_id AS uid FROM purchases
          WHERE status = 'paid' AND package_id = $1 AND buyer_user_id IS NOT NULL`,
        [pk.id]
      );
      for (const b of buyers.rows) {
        await upsertNotif(poolQ, b.uid, 'package-topup', `package:${pk.id}`,
          'New photo in your package', `"${pk.title}" grew by a photo`,
          '/photos/library');
      }
    }
    // 2. Watchers of the horse/rider ("photos are live"), honoring opt-in.
    if (!media.horse_id && !media.rider_id) return;
    const watchers = await poolQ.query(
      `SELECT DISTINCT w.user_id AS uid FROM watchlist_items w
        LEFT JOIN alert_prefs ap ON ap.user_id = w.user_id
        WHERE COALESCE(ap.new_photos, TRUE)
          AND ((w.entity_type = 'horse' AND w.entity_id = $1)
            OR (w.entity_type = 'rider' AND w.entity_id = $2)
            OR (w.entity_type = 'combination'
              AND (($1::UUID IS NOT NULL AND w.horse_id = $1) OR ($2::UUID IS NOT NULL AND w.rider_id = $2))))`,
      [media.horse_id, media.rider_id]
    );
    const qp = new URLSearchParams();
    if (media.event_id) qp.set('event', media.event_id);
    if (media.horse_id) qp.set('horse', media.horse_id);
    else if (media.rider_id) qp.set('rider', media.rider_id);
    const link = `/photos?${qp}`;
    const subject = media.horse_id || media.rider_id;
    for (const w of watchers.rows) {
      await upsertNotif(poolQ, w.uid, 'photos-live', `photos:${media.event_id}:${subject}`,
        'New photos of your stable', 'Fresh photos just published', link);
    }
  }

  // ---- Public catalog (published only; previews/thumbs are CDN-public) ----
  // License tiers with prices (public by design — buyers pick one, Sportfot-style).
  app.get('/api/license-tiers', asyncH(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, label, price_cents, max_resolution, printable FROM license_tiers ORDER BY price_cents NULLS LAST, id`);
    res.json({ data: rows });
  }));

  app.get('/photos', asyncH(async (req, res) => {
    const conds = [`m.status = 'published'`, ORDER_PRIVATE_SQL], params = [];
    const push = (sql, v) => { params.push(v); conds.push(sql.replace('?', `$${params.length}`)); };
    // Photo opt-out (migration 066): hidden subjects vanish from public
    // browsing but stay reachable via direct link, purchase, and the owner's
    // own watchlist (?mine=1 enforces followership in SQL below).
    const HIDDEN_SQL = `NOT (COALESCE(h.photo_hidden, FALSE) OR COALESCE(r.photo_hidden, FALSE))`;
    if (req.query.mine === '1' && req.authUser) {
      params.push(req.authUser.id);
      const n = params.length;
      conds.push(`(${HIDDEN_SQL} OR EXISTS (SELECT 1 FROM watchlist_items w
        WHERE w.user_id = $${n}
          AND ((w.entity_type = 'horse' AND w.entity_id = m.horse_id)
            OR (w.entity_type = 'rider' AND w.entity_id = m.rider_id)
            OR (w.entity_type = 'combination' AND w.horse_id = m.horse_id AND w.rider_id = m.rider_id)))`);
    } else {
      conds.push(HIDDEN_SQL);
    }
    if (req.query.event_id) {
      const evid = await resolveId('events', req.query.event_id, res);
      if (!evid) return;
      push('m.event_id = ?', evid);
    }
    if (req.query.horse_id) {
      const hid = await resolveId('horses', req.query.horse_id, res);
      if (!hid) return;
      push('m.horse_id = ?', hid);
    }
    if (req.query.rider_id) {
      const rid = await resolveId('riders', req.query.rider_id, res);
      if (!rid) return;
      push('m.rider_id = ?', rid);
    }
    if (req.query.kind) push('m.kind = ?', String(req.query.kind));
    const limit = Math.min(parseInt(req.query.limit, 10) || 48, 200);
    params.push(limit);
    const { rows } = await pool.query(
      `SELECT m.id, m.kind, m.event_id, m.class_id, m.horse_id, m.rider_id,
          m.thumb_key, m.preview_key, m.width, m.height, m.taken_at,
          t.price_cents AS price_cents, m.license_default, m.moment, m.created_at,
          e.name AS event_name, h.name AS horse, r.name AS rider,
          p.name AS photographer
        FROM media m LEFT JOIN events e ON e.id = m.event_id
        LEFT JOIN horses h ON h.id = m.horse_id LEFT JOIN riders r ON r.id = m.rider_id
        JOIN photographers p ON p.id = m.photographer_id
        LEFT JOIN license_tiers t ON t.id = COALESCE(m.license_default, 'web')
        WHERE ${conds.join(' AND ')}
        ORDER BY m.created_at DESC LIMIT $${params.length}`,
      params
    );
    withUrls(rows);
    res.json({ data: rows });
  }));

  // NOTE: static sub-paths must be registered BEFORE '/photos/:id',
  // otherwise Express matches ":id" first ("packages" is not a UUID).
  // Public: packages for a photo's event × subject (upsell block).
  app.get('/photos/packages', asyncH(async (req, res) => {
    const { event_id, horse_id, rider_id } = req.query;
    if (!event_id || (!horse_id && !rider_id)) {
      return res.status(400).json({ error: 'need {event_id} + {horse_id|rider_id}' });
    }
    const conds = [`pk.status = 'published'`, 'pk.event_id = $1'];
    const params = [event_id];
    if (horse_id) { params.push(horse_id); conds.push(`pk.horse_id = $${params.length}`); }
    else { params.push(rider_id); conds.push(`pk.rider_id = $${params.length}`); }
    const { rows } = await pool.query(
      `SELECT pk.*, (SELECT COUNT(*)::INT FROM package_items WHERE package_id = pk.id) AS items,
          (SELECT COUNT(*)::INT FROM package_items pi JOIN media m ON m.id = pi.media_id
            WHERE pi.package_id = pk.id AND m.kind = 'reel') AS reels
        FROM packages pk WHERE ${conds.join(' AND ')} ORDER BY pk.price_cents LIMIT 10`,
      params
    );
    res.json({ data: rows });
  }));

  app.get('/photos/:id', asyncH(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT m.*, e.name AS event_name, e.date_start AS event_date,
          c.name AS class_name, h.name AS horse, r.name AS rider,
          p.name AS photographer, t.label AS tier_label
        FROM media m LEFT JOIN events e ON e.id = m.event_id
        LEFT JOIN license_tiers t ON t.id = COALESCE(m.license_default, 'web')
        LEFT JOIN classes c ON c.id = m.class_id
        LEFT JOIN horses h ON h.id = m.horse_id LEFT JOIN riders r ON r.id = m.rider_id
        JOIN photographers p ON p.id = m.photographer_id
        WHERE m.id = $1 AND m.status = 'published'`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'photo not found' });
    withUrls(rows);
    // Private order reels: invisible to everyone except the buyer (who gets
    // signed teaser URLs instead of the public CDN ones).
    try {
      const buyerUid = await privateOrderBuyer(pool, req.params.id);
      if (buyerUid && (!req.authUser || req.authUser.id !== buyerUid)) {
        return res.status(404).json({ error: 'photo not found' });
      }
      if (buyerUid && req.authUser) {
        const r0 = rows[0];
        try {
          if (r0.preview_key) r0.preview_url = await mediaStore.signedDownloadUrl(r0.preview_key);
          if (r0.thumb_key) r0.thumb_url = await mediaStore.signedDownloadUrl(r0.thumb_key);
        } catch { /* fall back to public URLs */ }
      }
    } catch { /* privacy gate optional — never break the detail page */ }
    // Ownership flag for the logged-in buyer (anonymous → owned:false).
    // Mirrors the download entitlement: direct purchase OR via a package
    // OR unlocked with photo credits.
    const data = rows[0];
    data.owned = false;
    if (req.authUser) {
      try {
        const ent = await pool.query(
          `SELECT id, license_tier FROM purchases
            WHERE status = 'paid' AND buyer_user_id = $2
              AND (media_id = $1 OR package_id IN (SELECT package_id FROM package_items WHERE media_id = $1))
            LIMIT 1`,
          [req.params.id, req.authUser.id]
        );
        if (ent.rows.length) {
          data.owned = true;
          data.owned_tier = ent.rows[0].license_tier;
          data.owned_purchase_id = ent.rows[0].id;
        } else {
          const cred = await pool.query(
            `SELECT 1 WHERE ${creditOwnedSql('$2', '$1')} LIMIT 1`,
            [req.params.id, req.authUser.id]
          );
          if (cred.rows.length) {
            data.owned = true;
            data.owned_tier = 'credit';
          } else {
            const reel = await pool.query(
              `SELECT 1 FROM reel_orders ro JOIN purchases p3 ON p3.id = ro.purchase_id
                WHERE p3.status = 'paid' AND p3.buyer_user_id = $2 AND ro.media_id = $1
                  AND ro.status IN ('ready', 'delivered') LIMIT 1`,
              [req.params.id, req.authUser.id]
            );
            if (reel.rows.length) {
              data.owned = true;
              data.owned_tier = 'reel';
            }
          }
        }
        if (!data.owned) {
          // Hint for the BuyBox: credits available in this photo's scope?
          const bal = await pool.query(
            `SELECT COALESCE(SUM(cb.slots_total - (SELECT COUNT(*) FROM credit_redemptions WHERE bundle_id = cb.id)), 0)::INT AS slots_left
              FROM credit_bundles cb JOIN purchases pu ON pu.id = cb.purchase_id
              WHERE cb.status = 'active' AND pu.status = 'paid' AND pu.buyer_user_id = $1
                AND cb.event_id = $2
                AND ((cb.rider_id IS NOT NULL AND cb.rider_id = $3)
                  OR (cb.horse_id IS NOT NULL AND cb.horse_id = $4))`,
            [req.authUser.id, rows[0].event_id, rows[0].rider_id, rows[0].horse_id]
          );
          if (Number(bal.rows[0]?.slots_left) > 0) {
            data.credit = { slots_left: Number(bal.rows[0].slots_left) };
          }
        }
      } catch { /* ownership optional — never break the detail page */ }
    }
    const rel = await pool.query(
      `SELECT m.id, m.thumb_key, m.kind, m.moment,
          t.price_cents AS price_cents, h.name AS horse, r.name AS rider
        FROM media m
        LEFT JOIN horses h ON h.id = m.horse_id
        LEFT JOIN riders r ON r.id = m.rider_id
        LEFT JOIN license_tiers t ON t.id = COALESCE(m.license_default, 'web')
        WHERE m.status = 'published' AND ${ORDER_PRIVATE_SQL}
          AND NOT (COALESCE(h.photo_hidden, FALSE) OR COALESCE(r.photo_hidden, FALSE))
          AND m.id <> $1
          AND (m.event_id = $2 OR m.horse_id = $3 OR m.rider_id = $4)
        ORDER BY m.created_at DESC LIMIT 8`,
      [req.params.id, rows[0].event_id, rows[0].horse_id, rows[0].rider_id]
    );
    withUrls(rel.rows);
    res.json({ data: rows[0], related: rel.rows });
  }));

  function withUrls(rows) {
    for (const r of rows) {
      try {
        if (r.preview_key) r.preview_url = mediaStore.publicUrl(r.preview_key);
        if (r.thumb_key) r.thumb_url = mediaStore.publicUrl(r.thumb_key);
      } catch { /* R2 public base unconfigured */ }
    }
  }

  // ---- Commerce: Stripe Checkout + webhook + downloads (plan §7) ----
  const APP_URL = (process.env.APP_URL || '').replace(/\/$/, '');

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const TIER_RE = /^[a-z0-9_-]{1,32}$/i;
  const normEmail = (v) => String(v || '').trim().toLowerCase().slice(0, 254);

  // POST /api/checkout {media_id|package_id, license_tier?, email?, idempotency_key?}
  // Login required: purchases bind to the buyer account (buyer_user_id).
  app.post('/api/checkout', asyncH(async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: 'login required' });
    if (throttled(req.ip, 'checkout')) return res.status(429).json({ error: 'too many requests, try again later' });
    const { media_id, package_id, license_tier, email, idempotency_key } = req.body || {};
    if (!!media_id === !!package_id) {
      return res.status(400).json({ error: 'need exactly one of {media_id, package_id}' });
    }
    if (media_id && !UUID_RE.test(String(media_id))) return res.status(400).json({ error: 'bad media_id' });
    if (package_id && !UUID_RE.test(String(package_id))) return res.status(400).json({ error: 'bad package_id' });
    if (license_tier !== undefined && license_tier !== null && !TIER_RE.test(String(license_tier))) {
      return res.status(400).json({ error: 'bad license_tier' });
    }
    if (idempotency_key !== undefined && idempotency_key !== null && !/^[A-Za-z0-9_-]{8,128}$/.test(String(idempotency_key))) {
      return res.status(400).json({ error: 'bad idempotency_key' });
    }
    const buyerEmail = normEmail(email || req.authUser.email);
    if (!EMAIL_RE.test(buyerEmail)) {
      return res.status(400).json({ error: 'need a valid {email}' });
    }
    let title, amount, tierId = license_tier || null, mediaId = null, packageId = null;
    if (media_id) {
      const m = await pool.query(
        `SELECT m.*, t.price_cents AS tier_price, t.label AS tier_label
          FROM media m LEFT JOIN license_tiers t ON t.id = $2
          WHERE m.id = $1 AND m.status = 'published'`,
        [media_id, tierId]
      );
      if (!m.rows.length) return res.status(404).json({ error: 'photo not found or not for sale' });
      // Private order reels can't be bought by anyone but their buyer.
      try {
        const buyerUid = await privateOrderBuyer(pool, String(media_id));
        if (buyerUid && buyerUid !== req.authUser.id) {
          return res.status(404).json({ error: 'photo not found or not for sale' });
        }
      } catch { /* gate optional */ }
      const row = m.rows[0];
      if (tierId && !row.tier_label) return res.status(400).json({ error: 'unknown license tier' });
      if (!tierId) {
        const dflt = await pool.query('SELECT * FROM license_tiers WHERE id = $1', [row.license_default || 'web']);
        tierId = dflt.rows[0]?.id || 'web';
        amount = dflt.rows[0]?.price_cents;
      } else {
        amount = row.tier_price;
      }
      if (!Number.isInteger(amount) || amount <= 0) return res.status(409).json({ error: 'no price set for this photo' });
      title = `${row.horse_id || row.rider_id ? '' : 'Event '}photo${row.moment ? ` (${row.moment})` : ''} · ${tierId}`;
      mediaId = row.id;
    } else {
      const pk = await pool.query(`SELECT * FROM packages WHERE id = $1 AND status = 'published'`, [package_id]);
      if (!pk.rows.length) return res.status(404).json({ error: 'package not found or not for sale' });
      amount = earlyPriceOf(pk.rows[0]) ?? pk.rows[0].price_cents;
      if (!Number.isInteger(amount) || amount <= 0) return res.status(409).json({ error: 'no price set for this package' });
      title = pk.rows[0].title;
      packageId = pk.rows[0].id;
    }
    // ---- Already-owned guard: a paid entitlement grants lifetime re-downloads,
    // so selling the same photo/package twice just double-charges the buyer.
    // Single photo: owned directly OR via any paid package containing it.
    // Package: owned directly (same package_id, paid).
    if (mediaId) {
      const owned = await pool.query(
        `SELECT id, license_tier FROM purchases
          WHERE status = 'paid' AND buyer_user_id = $2
            AND (media_id = $1 OR package_id IN (SELECT package_id FROM package_items WHERE media_id = $1))
          LIMIT 1`,
        [mediaId, req.authUser.id]
      );
      if (owned.rows.length) {
        return res.status(409).json({
          error: 'you already own this photo — download it from My photos',
          owned: true, license_tier: owned.rows[0].license_tier, purchase_id: owned.rows[0].id,
        });
      }
      const credOwned = await pool.query(
        `SELECT 1 WHERE ${creditOwnedSql('$2', '$1')} LIMIT 1`,
        [mediaId, req.authUser.id]
      );
      if (credOwned.rows.length) {
        return res.status(409).json({
          error: 'you already unlocked this photo with credits — download it from My photos',
          owned: true, license_tier: 'credit',
        });
      }
    } else if (packageId) {
      const owned = await pool.query(
        `SELECT id FROM purchases
          WHERE status = 'paid' AND buyer_user_id = $2 AND package_id = $1 LIMIT 1`,
        [packageId, req.authUser.id]
      );
      if (owned.rows.length) {
        return res.status(409).json({
          error: 'you already own this package — download it from My photos',
          owned: true, purchase_id: owned.rows[0].id,
        });
      }
    }
    if (idempotency_key) {
      const prior = await pool.query(
        `SELECT p.id, p.status, s.checkout_url FROM purchases p
          LEFT JOIN (SELECT purchase_id, checkout_url FROM stripe_checkout_cache) s ON s.purchase_id = p.id
          WHERE p.idempotency_key = $1 AND p.buyer_user_id = $2`,
        [String(idempotency_key), req.authUser.id]
      ).catch(() => ({ rows: [] }));
      if (prior.rows.length && prior.rows[0].checkout_url) {
        return res.status(200).json({ data: { purchase_id: prior.rows[0].id, checkout_url: prior.rows[0].checkout_url, reused: true } });
      }
    }
    let purchaseId;
    try {
      const { rows } = await pool.query(
        `INSERT INTO purchases (media_id, package_id, buyer_email, buyer_user_id, license_tier, amount_cents, currency, status, idempotency_key)
          VALUES ($1, $2, $3, $4, $5, $6, 'NZD', 'pending', $7) RETURNING id`,
        [mediaId, packageId, buyerEmail, req.authUser.id, tierId, amount, idempotency_key || null]
      );
      purchaseId = rows[0].id;
    } catch (e) {
      if (e.code === '23505' && idempotency_key) {
        const prior = await pool.query(
          'SELECT id, stripe_session_id FROM purchases WHERE idempotency_key = $1 AND buyer_user_id = $2',
          [String(idempotency_key), req.authUser.id]
        );
        if (prior.rows.length) {
          return res.status(200).json({ data: { purchase_id: prior.rows[0].id, checkout_url: null, reused: true, pending: true } });
        }
      }
      throw e;
    }
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      customer_email: buyerEmail,
      line_items: [{
        price_data: {
          currency: 'nzd',
          product_data: { name: title.slice(0, 120) },
          unit_amount: amount,
        },
        quantity: 1,
      }],
      success_url: `${APP_URL}/photos/success?purchase=${purchaseId}`,
      cancel_url: `${APP_URL}/photos`,
      metadata: { purchase_id: purchaseId },
    }, { idempotencyKey: idempotency_key ? `co-${idempotency_key}` : `co-${purchaseId}` });
    await pool.query('UPDATE purchases SET stripe_session_id = $2 WHERE id = $1', [purchaseId, session.id]);
    try {
      await pool.query(
        `CREATE TEMPORARY TABLE IF NOT EXISTS stripe_checkout_cache (purchase_id UUID, checkout_url TEXT)
          ON COMMIT DELETE ROWS`
      );
    } catch { /* temp cache optional */ }
    res.status(201).json({ data: { purchase_id: purchaseId, checkout_url: session.url } });
  }));

  // Stripe webhook — must see the RAW body (express.raw here; the global
  // JSON parser in security.js skips this path).
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), asyncH(async (req, res) => {
    const sig = req.headers['stripe-signature'];
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      console.error('[webhook] STRIPE_WEBHOOK_SECRET unset');
      return res.status(500).json({ error: 'webhook unconfigured' });
    }
    let event;
    try {
      event = stripe().webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (e) {
      console.error('[webhook] signature failed:', e.message);
      return res.status(400).json({ error: 'webhook signature failed' });
    }
    const ok = (extra) => res.json({ received: true, ...extra });
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object || {};
      const purchaseId = session.metadata?.purchase_id;
      if (!purchaseId || !UUID_RE.test(String(purchaseId))) return ok();
      if (session.payment_status && session.payment_status !== 'paid') return ok();
      const cur = await pool.query('SELECT amount_cents, buyer_email FROM purchases WHERE id = $1', [purchaseId]);
      if (!cur.rows.length) return ok();
      if (typeof session.amount_total === 'number' && session.amount_total !== cur.rows[0].amount_cents) {
        console.error('[webhook] amount mismatch', { purchaseId, expected: cur.rows[0].amount_cents, got: session.amount_total });
        return ok();
      }
      if (session.customer_email && cur.rows[0].buyer_email &&
        String(session.customer_email).toLowerCase() !== String(cur.rows[0].buyer_email).toLowerCase()) {
        console.error('[webhook] email mismatch', { purchaseId });
        return ok();
      }
      const done = await pool.query(
        `UPDATE purchases SET status = 'paid', stripe_payment_intent = COALESCE(stripe_payment_intent, $2)
          WHERE id = $1 AND status = 'pending' RETURNING id, media_id, package_id`,
        [purchaseId, session.payment_intent || null]
      );
      if (done.rows.length) {
        const r = done.rows[0];
        await pool.query(
          `UPDATE media SET purchase_count = purchase_count + 1 WHERE id = $1
            OR id IN (SELECT media_id FROM package_items WHERE package_id = $2)`,
          [r.media_id, r.package_id]
        );
        audit(req, 'media.purchase', 'purchase', purchaseId, { session: session.id });
        // Reel service orders: payment completed -> ready for production.
        await pool.query(
          `UPDATE reel_orders SET status = 'pending'
            WHERE purchase_id = $1 AND status = 'awaiting_payment'`,
          [purchaseId]
        ).catch(() => {});
        // Credit bundles: payment completed -> credits become usable.
        await pool.query(
          `UPDATE credit_bundles SET status = 'active'
            WHERE purchase_id = $1 AND status = 'awaiting_payment'`,
          [purchaseId]
        ).catch(() => {});
      }
      return ok();
    }
    if (event.type === 'charge.refunded' || event.type === 'charge.refund.updated') {
      const ch = event.data.object || {};
      const pi = ch.payment_intent || null;
      const refunded = ch.amount_refunded ?? null;
      const total = ch.amount ?? null;
      if (!pi) return ok();
      if (refunded !== null && total !== null && refunded < total) {
        console.error('[webhook] partial refund, keeping paid', { pi, refunded, total });
        return ok();
      }
      let sessionId = null;
      try {
        const sessions = await stripe().checkout.sessions.list({ payment_intent: String(pi), limit: 1 });
        sessionId = sessions.data[0]?.id || null;
      } catch (e) { console.error('[webhook] session lookup failed:', e.message); }
      const done = await pool.query(
        `UPDATE purchases SET status = 'refunded'
          WHERE status = 'paid' AND (stripe_payment_intent = $1 OR ($2::TEXT IS NOT NULL AND stripe_session_id = $2))
          RETURNING id`,
        [String(pi), sessionId]
      );
      if (done.rows.length) audit(req, 'media.refund', 'purchase', done.rows.map((r) => r.id).join(','), { pi });
      return ok();
    }
    return ok();
  }));

  // ---- Moment badges: suggest win/clear/debut from round_results ----
  // POST /admin/media/:id/suggest-moment
  app.post('/admin/media/:id/suggest-moment', needRole('ADMIN'), asyncH(async (req, res) => {
    const m = await pool.query('SELECT horse_id, rider_id, event_id FROM media WHERE id = $1', [req.params.id]);
    if (!m.rows.length) return res.status(404).json({ error: 'media not found' });
    const { horse_id, rider_id, event_id } = m.rows[0];
    const out = { suggested: null, reasons: [] };
    if (horse_id || rider_id) {
      const cond = horse_id ? 'rr.horse_id = $1' : 'rr.rider_id = $1';
      const wins = await pool.query(
        `SELECT COUNT(*)::INT AS n FROM round_results rr WHERE ${cond} AND rr.finish_place = 1 AND class_id_visible(rr.class_id)`,
        [horse_id || rider_id]
      );
      const clears = await pool.query(
        `SELECT COUNT(*)::INT AS n, MIN(c.class_date) AS first FROM round_results rr
          JOIN classes c ON c.id = rr.class_id
          WHERE ${cond} AND rr.clear_round AND class_id_visible(rr.class_id)`,
        [horse_id || rider_id]
      );
      if (wins.rows[0].n > 0) { out.suggested = 'win'; out.reasons.push(`${wins.rows[0].n} career wins`); }
      else if (clears.rows[0].n > 0) { out.suggested = 'clear'; out.reasons.push(`${clears.rows[0].n} clears`); }
    }
    if (event_id && (horse_id || rider_id)) {
      const cond = horse_id ? 'rr.horse_id = $1' : 'rr.rider_id = $1';
      const prior = await pool.query(
        `SELECT COUNT(*)::INT AS n FROM round_results rr JOIN classes c ON c.id = rr.class_id
          WHERE ${cond} AND rr.event_id <> $2 AND c.class_date < (SELECT MIN(c2.class_date) FROM classes c2 JOIN round_results r2 ON r2.class_id = c2.id WHERE r2.event_id = $2 AND ${cond.replace('rr.', 'r2.')})`,
        [horse_id || rider_id, event_id]
      ).catch(() => ({ rows: [{ n: 1 }] }));
      if (prior.rows[0].n === 0) { out.suggested = out.suggested || 'debut'; out.reasons.push('first tracked event'); }
    }
    res.json({ data: out });
  }));

  // Download: session-owned entitlement → 303 to signed R2 URL (15 min).
  // Login required — the email oracle is closed.
  app.get('/api/media/:id/download', asyncH(async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: 'login required' });
    if (!UUID_RE.test(String(req.params.id))) return res.status(400).json({ error: 'bad id' });
    const m = await pool.query('SELECT * FROM media WHERE id = $1 AND status = $2', [req.params.id, 'published']);
    if (!m.rows.length) return res.status(404).json({ error: 'photo not found' });
    if (!m.rows[0].storage_key) return res.status(409).json({ error: 'original not stored yet' });
    const ent = await pool.query(
      `SELECT 1 FROM purchases
        WHERE status = 'paid' AND buyer_user_id = $2
          AND (media_id = $1 OR package_id IN (SELECT package_id FROM package_items WHERE media_id = $1))
        LIMIT 1`,
      [req.params.id, req.authUser.id]
    );
    const credEnt = ent.rows.length ? { rows: [] } : await pool.query(
      `SELECT 1 WHERE ${creditOwnedSql('$2', '$1')} LIMIT 1`,
      [req.params.id, req.authUser.id]
    );
    // Finished reel of the buyer's own reel order (linked at delivery).
    const reelEnt = (ent.rows.length || credEnt.rows.length) ? { rows: [] } : await pool.query(
      `SELECT 1 FROM reel_orders ro JOIN purchases p3 ON p3.id = ro.purchase_id
        WHERE p3.status = 'paid' AND p3.buyer_user_id = $2 AND ro.media_id = $1
          AND ro.status IN ('ready', 'delivered') LIMIT 1`,
      [req.params.id, req.authUser.id]
    );
    if (!ent.rows.length && !credEnt.rows.length && !reelEnt.rows.length) {
      return res.status(402).json({ error: 'purchase required' });
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.redirect(303, await mediaStore.signedDownloadUrl(m.rows[0].storage_key));
  }));

  // Single purchase status (owner-only; powers the success page).
  app.get('/api/purchases/:id', asyncH(async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: 'login required' });
    if (!UUID_RE.test(String(req.params.id))) return res.status(400).json({ error: 'bad id' });
    const { rows } = await pool.query(
      `SELECT p.id, p.status, p.license_tier, p.amount_cents, p.created_at,
          m.id AS media_id, m.kind, COALESCE(e.name, re.name) AS event_name,
          COALESCE(h.name, ro.horse_name) AS horse, r.name AS rider,
          rp.name AS reel_product, ro.status AS reel_status
        FROM purchases p LEFT JOIN media m ON m.id = p.media_id
        LEFT JOIN events e ON e.id = m.event_id
        LEFT JOIN horses h ON h.id = m.horse_id LEFT JOIN riders r ON r.id = m.rider_id
        LEFT JOIN reel_orders ro ON ro.id = p.reel_order_id
        LEFT JOIN reel_products rp ON rp.id = ro.product_id
        LEFT JOIN events re ON re.id = ro.event_id
        WHERE p.id = $1 AND p.buyer_user_id = $2`,
      [req.params.id, req.authUser.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'purchase not found' });
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ data: rows[0] });
  }));

  // Buyer library ("my photos") — session-owned. Package purchases expand
  // to one row per contained photo so buyers can find what they paid for.
  app.get('/api/my/photos', asyncH(async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: 'login required' });
    const { rows } = await pool.query(
      `SELECT pu.id AS purchase_id, pu.license_tier, pu.amount_cents, pu.status, pu.created_at,
          m.id AS media_id, m.kind, m.thumb_key, m.preview_key, m.event_id,
          e.name AS event_name, h.name AS horse, r.name AS rider
        FROM purchases pu
        JOIN LATERAL (
          SELECT m.* FROM media m WHERE m.id = pu.media_id
          UNION ALL
          SELECT m.* FROM package_items pi JOIN media m ON m.id = pi.media_id
            WHERE pi.package_id = pu.package_id
        ) m ON true
        LEFT JOIN events e ON e.id = m.event_id
        LEFT JOIN horses h ON h.id = m.horse_id LEFT JOIN riders r ON r.id = m.rider_id
        WHERE pu.buyer_user_id = $1 AND pu.status = 'paid'
        UNION ALL
        SELECT pu.id AS purchase_id, 'credit' AS license_tier, pu.amount_cents, pu.status, cr.created_at,
          m.id AS media_id, m.kind, m.thumb_key, m.preview_key, m.event_id,
          e.name AS event_name, h.name AS horse, r.name AS rider
        FROM credit_redemptions cr
        JOIN credit_bundles cb ON cb.id = cr.bundle_id
        JOIN purchases pu ON pu.id = cb.purchase_id
        JOIN media m ON m.id = cr.media_id
        LEFT JOIN events e ON e.id = m.event_id
        LEFT JOIN horses h ON h.id = m.horse_id LEFT JOIN riders r ON r.id = m.rider_id
        WHERE pu.buyer_user_id = $1 AND pu.status = 'paid' AND cb.status = 'active'
        ORDER BY created_at DESC LIMIT 200`,
      [req.authUser.id]
    );
    withUrls(rows);
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ data: rows });
  }));

  // ---- Admin sales: transactions list, summary + filtered CSV export ----
  // One shared filter set (best practice: the export and the KPIs always
  // honor exactly what the table shows):
  //   status=paid|pending|refunded · tier=<license id> · kind=photo|package|reel|credit
  //   q=<buyer email / horse / rider / event / package title>
  //   event_id=<uuid> · since=YYYY-MM-DD · until=YYYY-MM-DD (inclusive)
  const SALES_JOIN = `
    FROM purchases pu
    LEFT JOIN media m ON m.id = pu.media_id
    LEFT JOIN events e ON e.id = m.event_id
    LEFT JOIN horses h ON h.id = m.horse_id
    LEFT JOIN riders r ON r.id = m.rider_id
    LEFT JOIN packages pk ON pk.id = pu.package_id
    LEFT JOIN reel_orders ro ON ro.id = pu.reel_order_id
    LEFT JOIN reel_products rp ON rp.id = ro.product_id
    LEFT JOIN credit_bundles cb ON cb.id = pu.credit_bundle_id
    LEFT JOIN credit_packs cp ON cp.id = cb.pack_id
    LEFT JOIN events ce ON ce.id = cb.event_id
    LEFT JOIN horses ch ON ch.id = cb.horse_id
    LEFT JOIN riders crr ON crr.id = cb.rider_id
    LEFT JOIN photographers ph ON ph.id = COALESCE(m.photographer_id, pk.photographer_id, rp.photographer_id, cp.photographer_id)`;
  const KIND_CASE = `CASE WHEN pu.media_id IS NOT NULL THEN 'photo'
               WHEN pu.package_id IS NOT NULL THEN 'package'
               WHEN pu.reel_order_id IS NOT NULL THEN 'reel'
               ELSE 'credit' END`;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  function salesWhere(query, params) {
    const conds = [];
    if (query.status && ['pending', 'paid', 'refunded'].includes(String(query.status))) {
      params.push(String(query.status));
      conds.push(`pu.status = $${params.length}`);
    }
    if (query.tier) {
      // Packages check out with license_tier NULL — the 'bundle' pseudo-tier
      // selects them so the filter actually matches.
      if (String(query.tier) === 'bundle') conds.push('pu.package_id IS NOT NULL');
      else {
        params.push(String(query.tier).slice(0, 32));
        conds.push(`pu.license_tier = $${params.length}`);
      }
    }
    if (query.kind === 'photo') conds.push('pu.media_id IS NOT NULL');
    else if (query.kind === 'package') conds.push('pu.package_id IS NOT NULL');
    else if (query.kind === 'reel') conds.push('pu.reel_order_id IS NOT NULL');
    else if (query.kind === 'credit') conds.push('pu.credit_bundle_id IS NOT NULL');
    if (query.event_id) {
      if (!UUID_RE.test(String(query.event_id))) {
        const e = new Error('bad event_id');
        e.status = 400;
        throw e;
      }
      params.push(String(query.event_id), String(query.event_id));
      conds.push(`(m.event_id = $${params.length - 1} OR pk.event_id = $${params.length})`);
    }
    if (query.q && String(query.q).trim()) {
      const like = `%${String(query.q).trim().slice(0, 80)}%`;
      params.push(like, like, like, like, like);
      const n = params.length;
      conds.push(`(pu.buyer_email ILIKE $${n - 4} OR h.name ILIKE $${n - 3} OR r.name ILIKE $${n - 2} OR e.name ILIKE $${n - 1} OR pk.title ILIKE $${n})`);
    }
    if (query.since) {
      if (!DATE_RE.test(String(query.since))) {
        const e = new Error('since must be YYYY-MM-DD');
        e.status = 400;
        throw e;
      }
      params.push(String(query.since));
      conds.push(`pu.created_at >= $${params.length}::date`);
    }
    if (query.until) {
      if (!DATE_RE.test(String(query.until))) {
        const e = new Error('until must be YYYY-MM-DD');
        e.status = 400;
        throw e;
      }
      params.push(String(query.until));
      conds.push(`pu.created_at < ($${params.length}::date + INTERVAL '1 day')`);
    }
    return conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  }

  // Admin: sales CSV export (plan §9 settlement). Honors the same filters
  // as the table; adds photographer + platform-fee/payout columns so the
  // file doubles as the monthly settlement + GST record.
  app.get('/admin/sales.csv', needRole('ADMIN'), asyncH(async (req, res) => {
    const params = [];
    const where = salesWhere(req.query, params);
    const { rows } = await pool.query(
      `SELECT pu.id, pu.created_at, pu.buyer_email, pu.license_tier, pu.amount_cents,
          pu.currency, pu.status, pu.stripe_session_id,
          ${KIND_CASE} AS kind,
          COALESCE(e.name, ce.name) AS event_name,
          COALESCE(h.name, ch.name) AS horse, COALESCE(r.name, crr.name) AS rider,
          pk.title AS package_title,
          ro.horse_name AS reel_horse, rp.name AS reel_product,
          cp.slots AS credit_slots,
          ph.name AS photographer, ph.commission_rate
        ${SALES_JOIN} ${where}
        ORDER BY pu.created_at DESC LIMIT 5000`,
      params
    );
    const q = (v) => {
      let s = String(v ?? '');
      if (/^[=+\-@\t]/.test(s)) s = `'${s}`;
      return `"${s.replace(/"/g, '""')}"`;
    };
      // Settlement math (family operation: commission is 0, see migration 062).
    // payout = gross − platform_fee − stripe_fee_est. Stripe NZ domestic is
    // 1.75% + 30¢ per successful charge; international cards differ, hence "est".
    // If the fee ever needs exactness, read it from Stripe Balance Transactions.
    const feeOf = (r) => {
      if (r.status !== 'paid') return 0;
      const rate = Number(r.commission_rate ?? 0) || 0;
      return Math.round(Number(r.amount_cents || 0) * rate);
    };
    const stripeFeeOf = (r) => {
      if (r.status !== 'paid') return 0;
      return Math.round(Number(r.amount_cents || 0) * 0.0175) + 30;
    };
    audit(req, 'sales.export', 'purchase', null, { filters: req.query, rows: rows.length });
    const day = new Date().toISOString().slice(0, 10);
    const csv = ['purchase_id,created_at,buyer_email,item_type,item,event,horse,rider,license_tier,amount_cents,currency,status,photographer,platform_fee_cents,stripe_fee_est_cents,payout_cents,stripe_session_id',
      ...rows.map((r) => {
        const item = r.kind === 'photo'
          ? [r.horse, r.rider].filter(Boolean).join(' × ') || r.event_name || 'Photo'
          : r.kind === 'reel'
            ? `${r.reel_product || 'Reel'} — ${r.reel_horse || ''}`.trim()
            : r.kind === 'credit'
              ? `${r.credit_slots || 5}-photo credits — ${[r.horse, r.rider].filter(Boolean).join(' × ') || ''}`.trim()
              : r.package_title || 'Package';
        const fee = feeOf(r);
        const stripeFee = stripeFeeOf(r);
        const payout = r.status === 'paid' ? Number(r.amount_cents || 0) - fee - stripeFee : 0;
        const tierLabel = (k) => k === 'photo' ? '' : k === 'package' ? 'bundle' : k;
        return [r.id, r.created_at, r.buyer_email, r.kind, item, r.event_name, r.horse,
          r.rider, r.license_tier || tierLabel(r.kind),
          r.amount_cents, r.currency, r.status, r.photographer, fee, stripeFee, payout,
          r.stripe_session_id].map(q).join(',');
      })].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="eqindex-sales-${day}.csv"`);
    res.send(csv);
  }));

  // Admin: photo view→purchase funnel (plan §8.6).
  app.get('/admin/media/stats', needRole('ADMIN'), asyncH(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::INT AS assets,
          COUNT(*) FILTER (WHERE status = 'published')::INT AS published,
          COALESCE(SUM(view_count), 0)::INT AS views,
          COALESCE(SUM(purchase_count), 0)::INT AS purchases,
          (SELECT COUNT(*)::INT FROM purchases WHERE status = 'paid')::INT AS paid_sales,
          (SELECT COALESCE(SUM(amount_cents), 0)::INT FROM purchases WHERE status = 'paid')::INT AS gross_cents
        FROM media`
    );
    res.json({ data: rows[0] });
  }));

  // Admin sales table: filterable + paginated. `totals` is filter-aware
  // (sales = matching rows incl. pending/refunded; gross = paid only).
  app.get('/admin/sales', needRole('ADMIN'), asyncH(async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const params = [];
    const where = salesWhere(req.query, params);
    const pageParams = [...params, limit, offset];
    const { rows } = await pool.query(
      `SELECT pu.id, pu.created_at, pu.buyer_email, pu.buyer_user_id, pu.media_id, pu.package_id,
          pu.license_tier, pu.amount_cents, pu.currency, pu.status, pu.stripe_session_id,
          pu.stripe_payment_intent,
          CASE WHEN pu.status = 'paid' THEN (ROUND(pu.amount_cents * 0.0175) + 30)::INT ELSE 0 END AS stripe_fee_est_cents,
          COALESCE(e.name, ce.name) AS event_name,
          COALESCE(h.name, ch.name) AS horse, COALESCE(r.name, crr.name) AS rider,
          pk.title AS package_title,
          ph.name AS photographer,
          ${KIND_CASE} AS kind
        ${SALES_JOIN} ${where}
        ORDER BY pu.created_at DESC LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
      pageParams
    );
    const [total, totals] = await Promise.all([
      pool.query(`SELECT COUNT(*)::INT AS n ${SALES_JOIN} ${where}`, params),
      pool.query(
        `SELECT COUNT(*)::INT AS sales,
            COALESCE(SUM(CASE WHEN pu.status = 'paid' THEN pu.amount_cents ELSE 0 END), 0)::INT AS gross_cents
          ${SALES_JOIN} ${where}`,
        params
      ),
    ]);
    res.json({
      data: rows,
      totals: totals.rows[0],
      pagination: { total: total.rows[0].n, limit, offset },
    });
  }));

  // Admin sales summary: filter-aware KPIs + revenue-by-tier + daily trend +
  // photographer settlement (plan §9: payout = gross − platform fee).
  app.get('/admin/sales/summary', needRole('ADMIN'), asyncH(async (req, res) => {
    const params = [];
    const where = salesWhere(req.query, params);
    const [kpis, tiers, days, settle] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE pu.status = 'paid')::INT AS paid,
            COUNT(*) FILTER (WHERE pu.status = 'pending')::INT AS pending,
            COUNT(*) FILTER (WHERE pu.status = 'refunded')::INT AS refunded,
            COALESCE(SUM(pu.amount_cents) FILTER (WHERE pu.status = 'paid'), 0)::INT AS gross_cents,
            COALESCE(SUM(pu.amount_cents) FILTER (WHERE pu.status = 'pending'), 0)::INT AS pending_cents
          ${SALES_JOIN} ${where}`,
        params
      ),
      pool.query(
        `SELECT CASE WHEN pu.reel_order_id IS NOT NULL THEN 'reel'
               WHEN pu.credit_bundle_id IS NOT NULL THEN 'credit'
               ELSE COALESCE(pu.license_tier, 'bundle') END AS tier,
            COUNT(*)::INT AS sales, COALESCE(SUM(pu.amount_cents), 0)::INT AS gross_cents
          ${SALES_JOIN} ${where ? `${where} AND` : 'WHERE'} pu.status = 'paid'
          GROUP BY 1 ORDER BY gross_cents DESC`,
        params
      ),
      pool.query(
        `SELECT to_char(pu.created_at, 'YYYY-MM-DD') AS day,
            COUNT(*)::INT AS sales, COALESCE(SUM(pu.amount_cents), 0)::INT AS gross_cents
          ${SALES_JOIN} ${where ? `${where} AND` : 'WHERE'} pu.status = 'paid'
          GROUP BY 1 ORDER BY 1 DESC LIMIT 31`,
        params
      ),
      pool.query(
        `SELECT ph.id AS photographer_id, ph.name AS photographer, ph.commission_rate,
            COUNT(*)::INT AS sales, COALESCE(SUM(pu.amount_cents), 0)::INT AS gross_cents,
            COALESCE(SUM(ROUND(pu.amount_cents * 0.0175) + 30), 0)::INT AS stripe_fee_cents
          ${SALES_JOIN} ${where ? `${where} AND` : 'WHERE'} pu.status = 'paid'
          GROUP BY ph.id, ph.name, ph.commission_rate ORDER BY gross_cents DESC`,
        params
      ),
    ]);
    const k = kpis.rows[0];
    const settlement = settle.rows.map((s) => {
      const rate = Number(s.commission_rate ?? 0) || 0;
      const fee = Math.round(Number(s.gross_cents || 0) * rate);
      const stripeFee = Number(s.stripe_fee_cents || 0);
      return {
        photographer_id: s.photographer_id,
        photographer: s.photographer || '—',
        commission_rate: rate,
        sales: s.sales,
        gross_cents: s.gross_cents,
        fee_cents: fee,
        stripe_fee_cents: stripeFee,
        payout_cents: Number(s.gross_cents || 0) - fee - stripeFee,
      };
    });
    res.json({
      data: {
        kpis: {
          ...k,
          avg_cents: k.paid > 0 ? Math.round(Number(k.gross_cents) / Number(k.paid)) : 0,
        },
        by_tier: tiers.rows,
        by_day: days.rows.reverse(),
        settlement,
      },
    });
  }));

  // ---- Packages: auto-create per event × horse/rider (plan §3.4) ----
  // POST /admin/packages {event_id, horse_id?, rider_id?, price_cents?}
  app.post('/admin/packages', needRole('ADMIN'), asyncH(async (req, res) => {
    const { event_id, horse_id, rider_id, price_cents, title } = req.body || {};
    if (!event_id || (!!horse_id === !!rider_id)) {
      return res.status(400).json({ error: 'need {event_id} + exactly one of {horse_id, rider_id}' });
    }
    const ev = await pool.query('SELECT id, name FROM events WHERE id = $1', [event_id]);
    if (!ev.rows.length) return res.status(404).json({ error: 'event not found' });
    let who = null;
    if (horse_id) {
      const hid = await resolveId('horses', horse_id, res);
      if (!hid) return;
      const h = await pool.query('SELECT name FROM horses WHERE id = $1', [hid]);
      who = { col: 'horse_id', id: hid, name: h.rows[0]?.name || 'horse' };
    } else {
      const rid = await resolveId('riders', rider_id, res);
      if (!rid) return;
      const r = await pool.query('SELECT name FROM riders WHERE id = $1', [rid]);
      who = { col: 'rider_id', id: rid, name: r.rows[0]?.name || 'rider' };
    }
    const photographer = await activePhotographer(pool, req.body?.photographer_id);
    const items = await pool.query(
      `SELECT m.id, COALESCE(t.price_cents, 0) AS price_cents FROM media m
        LEFT JOIN license_tiers t ON t.id = COALESCE(m.license_default, 'web')
        WHERE m.status = 'published' AND m.event_id = $1 AND m.${who.col} = $2`,
      [event_id, who.id]
    );
    if (!items.rows.length) return res.status(409).json({ error: 'no published photos for this event × subject' });
    const sum = items.rows.reduce((s, x) => s + Number(x.price_cents), 0);
    const singleMax = Math.max(...items.rows.map((x) => Number(x.price_cents)));
    const auto = price_cents !== undefined && price_cents !== null ? Math.max(0, parseInt(price_cents, 10) || 0)
      : Math.max(Math.floor(0.6 * sum), singleMax);
    const { rows } = await pool.query(
      `INSERT INTO packages (photographer_id, event_id, ${who.col}, title, price_cents, auto, status)
        VALUES ($1, $2, $3, $4, $5, true, 'published') RETURNING *`,
      [photographer.id, event_id, who.id,
        title || `All ${items.rows.length} photos of ${who.name} at ${ev.rows[0].name}`, auto]
    );
    await pool.query(
      `INSERT INTO package_items (package_id, media_id)
        SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING`,
      [rows[0].id, items.rows.map((x) => x.id)]
    );
    audit(req, 'package.create', 'package', rows[0].id, { items: items.rows.length, auto });
    res.status(201).json({ data: { ...rows[0], items: items.rows.length } });
  }));

  app.get('/admin/packages', needRole('ADMIN'), asyncH(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT pk.*, e.name AS event_name,
          (SELECT COUNT(*)::INT FROM package_items WHERE package_id = pk.id) AS items
        FROM packages pk LEFT JOIN events e ON e.id = pk.event_id
        ORDER BY pk.created_at DESC LIMIT 100`
    );
    res.json({ data: rows });
  }));

  // ---- License tiers (admin CRUD; buyers read prices via GET /api/license-tiers) ----
  app.get('/admin/license-tiers', needRole('ADMIN'), asyncH(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT * FROM license_tiers ORDER BY sort_order NULLS LAST, price_cents NULLS LAST, id');
    res.json({ data: rows });
  }));

  app.post('/admin/license-tiers', needRole('ADMIN'), asyncH(async (req, res) => {
    const { id, label, price_cents, max_resolution, printable, sort_order } = req.body || {};
    if (!id || !TIER_RE.test(String(id))) return res.status(400).json({ error: 'need {id} (a-z, 0-9, _, -)' });
    const price = price_cents === null || price_cents === undefined || price_cents === ''
      ? null : parseInt(price_cents, 10);
    if (price !== null && !(price >= 0)) return res.status(400).json({ error: 'price_cents must be a non-negative integer or null' });
    const sortRaw = sort_order === undefined || sort_order === null || sort_order === '' ? null : parseInt(sort_order, 10);
    if (sortRaw !== null && !Number.isInteger(sortRaw)) return res.status(400).json({ error: 'sort_order must be an integer' });
    try {
      const { rows } = await pool.query(
      `INSERT INTO license_tiers (id, label, price_cents, max_resolution, printable, sort_order)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM license_tiers))) RETURNING *`,
        [String(id).toLowerCase(), String(label || id), price,
          max_resolution ? String(max_resolution).slice(0, 40) : null,
          printable === undefined ? true : !!printable,
          sort_order === undefined || sort_order === '' ? null : parseInt(sort_order, 10)]);
      audit(req, 'tier.create', 'license_tier', id, {});
      res.status(201).json({ data: rows[0] });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'tier id already exists' });
      throw e;
    }
  }));

  app.patch('/admin/license-tiers/:id', needRole('ADMIN'), asyncH(async (req, res) => {
    const b = req.body || {};
    const sets = [], vals = [];
    const set = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if (b.label !== undefined) set('label', String(b.label).slice(0, 80));
    if (b.price_cents !== undefined) {
      const price = b.price_cents === null || b.price_cents === '' ? null : parseInt(b.price_cents, 10);
      if (price !== null && !(price >= 0)) return res.status(400).json({ error: 'price_cents must be a non-negative integer or null' });
      set('price_cents', price);
    }
    if (b.max_resolution !== undefined) set('max_resolution', b.max_resolution ? String(b.max_resolution).slice(0, 40) : null);
    if (b.printable !== undefined) set('printable', !!b.printable);
    if (b.sort_order !== undefined && b.sort_order !== '' && b.sort_order !== null) {
      const so = parseInt(b.sort_order, 10);
      if (!Number.isInteger(so)) return res.status(400).json({ error: 'sort_order must be an integer' });
      set('sort_order', so);
    }
    if (!sets.length) return res.status(400).json({ error: 'nothing to update' });
    vals.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE license_tiers SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
    if (!rows.length) return res.status(404).json({ error: 'tier not found' });
    audit(req, 'tier.edit', 'license_tier', req.params.id, { fields: sets.map((s) => s.split(' = ')[0]) });
    res.json({ data: rows[0] });
  }));

  app.delete('/admin/license-tiers/:id', needRole('ADMIN'), asyncH(async (req, res) => {
    // 'web' is the hardcoded pricing fallback (checkout + buy box) — removing
    // it silently degrades every photo without an explicit tier.
    if (req.params.id === 'web') {
      return res.status(409).json({ error: "'web' is the system default tier — rename/reprice it instead" });
    }
    const used = await pool.query(
      `SELECT (SELECT COUNT(*)::INT FROM media WHERE license_default = $1)
          + (SELECT COUNT(*)::INT FROM purchases WHERE license_tier = $1) AS n`,
      [req.params.id]);
    if (used.rows[0].n > 0) {
      return res.status(409).json({ error: 'tier in use (media defaults / purchases) — edit instead' });
    }
    const { rows } = await pool.query('DELETE FROM license_tiers WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'tier not found' });
    audit(req, 'tier.delete', 'license_tier', req.params.id, {});
    res.json({ ok: true });
  }));

  // ---- Packages: edit price/title/status, safe delete ----
  app.patch('/admin/packages/:id', needRole('ADMIN'), asyncH(async (req, res) => {
    const b = req.body || {};
    const sets = [], vals = [];
    const set = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if (b.title !== undefined) set('title', String(b.title).slice(0, 160));
    if (b.price_cents !== undefined) {
      const price = b.price_cents === '' || b.price_cents === null ? null : parseInt(b.price_cents, 10);
      if (price !== null && !(price >= 0)) return res.status(400).json({ error: 'price_cents must be a non-negative integer or null' });
      set('price_cents', price);
    }
    if (b.early_price_cents !== undefined) {
      const early = b.early_price_cents === '' || b.early_price_cents === null ? null : parseInt(b.early_price_cents, 10);
      if (early !== null && !(early >= 0)) return res.status(400).json({ error: 'early_price_cents must be a non-negative integer or null' });
      set('early_price_cents', early);
    }
    if (b.early_until !== undefined) {
      const until = !b.early_until ? null : new Date(b.early_until);
      if (until !== null && Number.isNaN(until.getTime())) return res.status(400).json({ error: 'early_until must be ISO datetime' });
      set('early_until', until ? until.toISOString() : null);
    }
    if (b.status !== undefined) {
      if (!['draft', 'published', 'archived'].includes(b.status)) {
        return res.status(400).json({ error: 'status must be draft|published|archived' });
      }
      set('status', b.status);
    }
    if (!sets.length) return res.status(400).json({ error: 'nothing to update' });
    vals.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE packages SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
    if (!rows.length) return res.status(404).json({ error: 'package not found' });
    audit(req, 'package.edit', 'package', req.params.id, { fields: sets.map((s) => s.split(' = ')[0]) });
    res.json({ data: rows[0] });
  }));

  app.delete('/admin/packages/:id', needRole('ADMIN'), asyncH(async (req, res) => {
    const paid = await pool.query(
      `SELECT COUNT(*)::INT AS n FROM purchases WHERE status = 'paid' AND package_id = $1`,
      [req.params.id]);
    if (paid.rows[0].n > 0) {
      return res.status(409).json({ error: 'has paid purchases — archive instead of deleting' });
    }
    await pool.query('DELETE FROM package_items WHERE package_id = $1', [req.params.id]);
    const { rows } = await pool.query('DELETE FROM packages WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'package not found' });
    audit(req, 'package.delete', 'package', req.params.id, {});
    res.json({ ok: true });
  }));

  // ---- Delete: DB row is source of truth; R2 keys removed best-effort.
  // Refused when the photo has paid purchases (refund/settle first).
  app.delete('/admin/media/:id', needRole('ADMIN'), asyncH(async (req, res) => {
    const cur = await pool.query('SELECT * FROM media WHERE id = $1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'media not found' });
    const paid = await pool.query(
      `SELECT COUNT(*)::INT AS n FROM purchases
        WHERE status = 'paid' AND (media_id = $1 OR package_id IN (SELECT package_id FROM package_items WHERE media_id = $1))`,
      [req.params.id]
    );
    if (paid.rows[0].n > 0) {
      return res.status(409).json({ error: 'has paid purchases — archive instead of deleting' });
    }
    await pool.query('DELETE FROM package_items WHERE media_id = $1', [req.params.id]);
    await pool.query('DELETE FROM media WHERE id = $1', [req.params.id]);
    const m = cur.rows[0];
    try {
      await mediaStore.deleteKeys([m.storage_key, m.preview_key, m.thumb_key, m.poster_key]);
    } catch (e) { console.error('[media.delete] R2 cleanup failed:', e.message); }
    audit(req, 'media.delete', 'media', req.params.id, { event_id: m.event_id });
    res.json({ ok: true });
  }));

  // ---- Reels: products (admin-set tiered prices per event) + request-based orders ----
  // Privacy model (migration 065): a finished custom reel is PRIVATE to its
  // buyer by default — excluded from catalog/detail/search unless the order
  // has showcase=true (buyer opt-in at order time). Direct-upload reels with
  // no order are unaffected. Storage posture: unlisted keys are unguessable
  // (UUID); private teasers are additionally served via signed URLs.
  const ORDER_PRIVATE_SQL =
    `NOT EXISTS (SELECT 1 FROM reel_orders ro
       WHERE ro.media_id = m.id AND COALESCE(ro.showcase, FALSE) = FALSE)`;
  // Is this media the private (non-showcase) product of someone's order?
  // Returns the order's buyer when private, else null.
  async function privateOrderBuyer(poolQ, mediaId) {
    const { rows } = await poolQ.query(
      `SELECT pu.buyer_user_id AS uid FROM reel_orders ro
        JOIN purchases pu ON pu.id = ro.purchase_id
        WHERE ro.media_id = $1 AND COALESCE(ro.showcase, FALSE) = FALSE
          AND pu.status = 'paid' LIMIT 1`,
      [mediaId]
    );
    return rows[0]?.uid || null;
  }
  const REEL_SCOPE = ['clip', 'round', 'event'];
  const REEL_COVERAGE = ['ring', 'full'];
  const REEL_MUSIC = ['choose_for_me', 'title', 'none'];
  const REEL_ORDER_FLOW = {
    awaiting_payment: ['pending', 'cancelled'],
    pending: ['in_production', 'cancelled'],
    in_production: ['ready', 'cancelled'],
    ready: ['delivered', 'cancelled'],
    delivered: [],
    cancelled: [],
  };

  // Public: published reel products for an event (event-specific + global defaults).
  app.get('/api/reel-products', asyncH(async (req, res) => {
    const params = [];
    let eventFilter = '';
    if (req.query.event_id) {
      if (!UUID_RE.test(String(req.query.event_id))) return res.status(400).json({ error: 'bad event_id' });
      params.push(String(req.query.event_id));
      eventFilter = `AND (rp.event_id = $1 OR rp.event_id IS NULL)`;
    }
    const { rows } = await pool.query(
      `SELECT rp.*, e.name AS event_name, p.name AS photographer
        FROM reel_products rp
        LEFT JOIN events e ON e.id = rp.event_id
        JOIN photographers p ON p.id = rp.photographer_id
        WHERE rp.status = 'published' ${eventFilter}
        ORDER BY rp.event_id NULLS LAST, rp.sort_order, rp.price_cents`,
      params
    );
    res.json({ data: rows });
  }));

  // Buyer creates a reel order + pays up front (Sportfot: add to cart -> pay -> produce).
  // One horse per order (Sportfot rule). Login required, like photo checkout.
  app.post('/api/reel-orders', asyncH(async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: 'login required' });
    if (throttled(req.ip, 'reel-order')) return res.status(429).json({ error: 'too many requests, try again later' });
    const b = req.body || {};
    if (!b.product_id || !UUID_RE.test(String(b.product_id))) {
      return res.status(400).json({ error: 'need {product_id}' });
    }
    const horseName = String(b.horse_name || '').trim().slice(0, 120);
    if (!horseName) return res.status(400).json({ error: 'need {horse_name} (one horse per order)' });
    const musicMode = String(b.music_mode || 'choose_for_me');
    if (!REEL_MUSIC.includes(musicMode)) return res.status(400).json({ error: 'music_mode must be choose_for_me|title|none' });
    const musicTitle = String(b.music_title || '').trim().slice(0, 160);
    if (musicMode === 'title' && !musicTitle) {
      return res.status(400).json({ error: 'music_title is required when music_mode=title' });
    }
    if (b.idempotency_key !== undefined && b.idempotency_key !== null &&
      !/^[A-Za-z0-9_-]{8,128}$/.test(String(b.idempotency_key))) {
      return res.status(400).json({ error: 'bad idempotency_key' });
    }
    const buyerEmail = normEmail(b.email || req.authUser.email);
    if (!EMAIL_RE.test(buyerEmail)) return res.status(400).json({ error: 'need a valid {email}' });

    const prod = await pool.query(
      `SELECT rp.*, e.name AS event_name FROM reel_products rp
        LEFT JOIN events e ON e.id = rp.event_id WHERE rp.id = $1`, [String(b.product_id)]);
    if (!prod.rows.length || prod.rows[0].status !== 'published') {
      return res.status(404).json({ error: 'reel product not found or not for sale' });
    }
    const product = prod.rows[0];
    // Event-scoped products can only be ordered for their own event.
    let eventId = null;
    if (product.event_id) {
      eventId = product.event_id;
    } else if (b.event_id) {
      if (!UUID_RE.test(String(b.event_id))) return res.status(400).json({ error: 'bad event_id' });
      const ev = await pool.query('SELECT id FROM events WHERE id = $1', [String(b.event_id)]);
      if (!ev.rows.length) return res.status(404).json({ error: 'event not found' });
      eventId = String(b.event_id);
    }
    if (!Number.isInteger(product.price_cents) || product.price_cents <= 0) {
      return res.status(409).json({ error: 'no price set for this reel product' });
    }
    let shootingDate = null;
    if (b.shooting_date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.shooting_date))) {
        return res.status(400).json({ error: 'shooting_date must be YYYY-MM-DD' });
      }
      shootingDate = String(b.shooting_date);
    }
    if (b.idempotency_key) {
      const prior = await pool.query(
        `SELECT ro.id AS order_id, p.id AS purchase_id FROM reel_orders ro
          JOIN purchases p ON p.id = ro.purchase_id
          WHERE p.idempotency_key = $1 AND p.buyer_user_id = $2`,
        [String(b.idempotency_key), req.authUser.id]
      ).catch(() => ({ rows: [] }));
      if (prior.rows.length) {
        return res.status(200).json({ data: { ...prior.rows[0], reused: true } });
      }
    }
    const { rows: orows } = await pool.query(
      `INSERT INTO reel_orders
        (product_id, event_id, buyer_user_id, buyer_email, shooting_date, ring, class_name,
         back_number, horse_name, music_mode, music_title, phone, price_cents, showcase, status)
        VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'awaiting_payment')
        RETURNING id`,
      [product.id, eventId, req.authUser.id, buyerEmail, shootingDate,
        String(b.ring || '').slice(0, 80) || null,
        String(b.class_name || '').slice(0, 160) || null,
        String(b.back_number || '').slice(0, 40) || null,
        horseName, musicMode, musicMode === 'title' ? musicTitle : null,
        String(b.phone || '').slice(0, 40) || null, product.price_cents,
        // Showcase opt-in: buyer allows the finished teaser in public galleries.
        // Unticked (default) = private to the buyer. Full file is always buyer-only.
        b.showcase === true || String(b.showcase).toLowerCase() === 'true']
    );
    const orderId = orows[0].id;
    let purchaseId;
    try {
      const { rows } = await pool.query(
        `INSERT INTO purchases (reel_order_id, buyer_email, buyer_user_id, license_tier, amount_cents, currency, status, idempotency_key)
          VALUES ($1, $2, $3, NULL, $4, 'NZD', 'pending', $5) RETURNING id`,
        [orderId, buyerEmail, req.authUser.id, product.price_cents, b.idempotency_key || null]
      );
      purchaseId = rows[0].id;
    } catch (e) {
      await pool.query(`UPDATE reel_orders SET status = 'cancelled' WHERE id = $1`, [orderId]);
      throw e;
    }
    await pool.query(`UPDATE reel_orders SET purchase_id = $2 WHERE id = $1`, [orderId, purchaseId]);
    const label = `${product.name} — ${horseName}`.slice(0, 120);
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      customer_email: buyerEmail,
      line_items: [{
        price_data: { currency: 'nzd', product_data: { name: label }, unit_amount: product.price_cents },
        quantity: 1,
      }],
      success_url: `${APP_URL}/photos/success?purchase=${purchaseId}`,
      cancel_url: `${APP_URL}/photos`,
      metadata: { purchase_id: purchaseId },
    }, { idempotencyKey: b.idempotency_key ? `reel-${b.idempotency_key}` : `reel-${purchaseId}` });
    await pool.query('UPDATE purchases SET stripe_session_id = $2 WHERE id = $1', [purchaseId, session.id]);
    res.status(201).json({ data: { order_id: orderId, purchase_id: purchaseId, checkout_url: session.url } });
  }));

  // Buyer: own reel orders (the "My medias" service side).
  app.get('/api/my/reels', asyncH(async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: 'login required' });
    const { rows } = await pool.query(
      `SELECT ro.*, rp.name AS product_name, rp.scope, e.name AS event_name,
          m.thumb_key, m.preview_key, m.status AS media_status
        FROM reel_orders ro JOIN reel_products rp ON rp.id = ro.product_id
        LEFT JOIN events e ON e.id = ro.event_id
        LEFT JOIN media m ON m.id = ro.media_id
        WHERE ro.buyer_user_id = $1 ORDER BY ro.created_at DESC LIMIT 100`,
      [req.authUser.id]
    );
    // Teaser URLs: public CDN when showcased, signed 15-min when private
    // (owner-only endpoint, so signing here is safe).
    for (const o of rows) {
      try {
        if (!o.preview_key) continue;
        if (o.showcase) {
          o.preview_url = mediaStore.publicUrl(o.preview_key);
          if (o.thumb_key) o.thumb_url = mediaStore.publicUrl(o.thumb_key);
        } else {
          o.preview_url = await mediaStore.signedDownloadUrl(o.preview_key);
          if (o.thumb_key) o.thumb_url = await mediaStore.signedDownloadUrl(o.thumb_key);
        }
      } catch { /* URLs optional */ }
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ data: rows });
  }));

  // ---- Admin: reel product catalog (prices set here, per event, no deploy) ----
  app.get('/admin/reel-products', needRole('ADMIN'), asyncH(async (req, res) => {
    const params = [];
    let where = '';
    if (req.query.event_id) {
      if (!UUID_RE.test(String(req.query.event_id))) return res.status(400).json({ error: 'bad event_id' });
      params.push(String(req.query.event_id));
      where = `WHERE rp.event_id = $1`;
    }
    const { rows } = await pool.query(
      `SELECT rp.*, e.name AS event_name,
          (SELECT COUNT(*)::INT FROM reel_orders WHERE product_id = rp.id AND status <> 'cancelled') AS orders
        FROM reel_products rp LEFT JOIN events e ON e.id = rp.event_id
        ${where} ORDER BY rp.event_id NULLS LAST, rp.sort_order, rp.created_at DESC LIMIT 200`,
      params
    );
    res.json({ data: rows });
  }));

  app.post('/admin/reel-products', needRole('ADMIN'), asyncH(async (req, res) => {
    const b = req.body || {};
    const name = String(b.name || '').trim().slice(0, 120);
    if (!name) return res.status(400).json({ error: 'need {name}' });
    const scope = String(b.scope || 'round');
    if (!REEL_SCOPE.includes(scope)) return res.status(400).json({ error: 'scope must be clip|round|event' });
    const coverage = String(b.coverage || 'ring');
    if (!REEL_COVERAGE.includes(coverage)) return res.status(400).json({ error: 'coverage must be ring|full' });
    const price = b.price_cents === '' || b.price_cents === null || b.price_cents === undefined
      ? null : parseInt(b.price_cents, 10);
    if (!(price >= 0)) return res.status(400).json({ error: 'price_cents must be a non-negative integer' });
    let eventId = null;
    if (b.event_id) {
      if (!UUID_RE.test(String(b.event_id))) return res.status(400).json({ error: 'bad event_id' });
      const ev = await pool.query('SELECT id FROM events WHERE id = $1', [String(b.event_id)]);
      if (!ev.rows.length) return res.status(404).json({ error: 'event not found' });
      eventId = String(b.event_id);
    }
    const photographer = await activePhotographer(pool, b.photographer_id);
    const { rows } = await pool.query(
      `INSERT INTO reel_products
        (photographer_id, event_id, name, scope, coverage, includes_raw, description, price_cents, sort_order, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, 'published')) RETURNING *`,
      [photographer.id, eventId, name, scope, coverage, !!b.includes_raw,
        String(b.description || '').slice(0, 500) || null,
        price, Number.isInteger(parseInt(b.sort_order, 10)) ? parseInt(b.sort_order, 10) : 0,
        ['draft', 'published', 'archived'].includes(b.status) ? b.status : 'published']
    );
    audit(req, 'reelproduct.create', 'reel_product', rows[0].id, { name, price_cents: price });
    res.status(201).json({ data: rows[0] });
  }));

  app.patch('/admin/reel-products/:id', needRole('ADMIN'), asyncH(async (req, res) => {
    const b = req.body || {};
    const sets = [], vals = [];
    const set = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if (b.name !== undefined) {
      const name = String(b.name).trim().slice(0, 120);
      if (!name) return res.status(400).json({ error: 'name must not be empty' });
      set('name', name);
    }
    if (b.scope !== undefined) {
      if (!REEL_SCOPE.includes(String(b.scope))) return res.status(400).json({ error: 'scope must be clip|round|event' });
      set('scope', String(b.scope));
    }
    if (b.coverage !== undefined) {
      if (!REEL_COVERAGE.includes(String(b.coverage))) return res.status(400).json({ error: 'coverage must be ring|full' });
      set('coverage', String(b.coverage));
    }
    if (b.includes_raw !== undefined) set('includes_raw', !!b.includes_raw);
    if (b.description !== undefined) set('description', String(b.description).slice(0, 500) || null);
    if (b.price_cents !== undefined) {
      const price = b.price_cents === '' || b.price_cents === null ? null : parseInt(b.price_cents, 10);
      if (!(price >= 0)) return res.status(400).json({ error: 'price_cents must be a non-negative integer' });
      set('price_cents', price);
    }
    if (b.sort_order !== undefined) {
      const so = parseInt(b.sort_order, 10);
      if (!Number.isInteger(so)) return res.status(400).json({ error: 'sort_order must be an integer' });
      set('sort_order', so);
    }
    if (b.status !== undefined) {
      if (!['draft', 'published', 'archived'].includes(b.status)) {
        return res.status(400).json({ error: 'status must be draft|published|archived' });
      }
      set('status', b.status);
    }
    if (!sets.length) return res.status(400).json({ error: 'nothing to update' });
    vals.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE reel_products SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
    if (!rows.length) return res.status(404).json({ error: 'reel product not found' });
    audit(req, 'reelproduct.edit', 'reel_product', req.params.id, { fields: sets.map((s) => s.split(' = ')[0]) });
    res.json({ data: rows[0] });
  }));

  app.delete('/admin/reel-products/:id', needRole('ADMIN'), asyncH(async (req, res) => {
    const live = await pool.query(
      `SELECT COUNT(*)::INT AS n FROM reel_orders WHERE product_id = $1 AND status <> 'cancelled'`,
      [req.params.id]);
    if (live.rows[0].n > 0) {
      return res.status(409).json({ error: 'has live orders — archive instead of deleting' });
    }
    await pool.query(`DELETE FROM reel_orders WHERE product_id = $1 AND status = 'cancelled'`, [req.params.id]);
    const { rows } = await pool.query('DELETE FROM reel_products WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'reel product not found' });
    audit(req, 'reelproduct.delete', 'reel_product', req.params.id, {});
    res.json({ ok: true });
  }));

  // ---- Admin: reel order fulfillment queue ----
  app.get('/admin/reel-orders', needRole('ADMIN'), asyncH(async (req, res) => {
    const conds = [], params = [];
    if (req.query.status && REEL_ORDER_FLOW[req.query.status]) {
      params.push(String(req.query.status));
      conds.push(`ro.status = $${params.length}`);
    }
    if (req.query.event_id) {
      if (!UUID_RE.test(String(req.query.event_id))) return res.status(400).json({ error: 'bad event_id' });
      params.push(String(req.query.event_id));
      conds.push(`ro.event_id = $${params.length}`);
    }
    const { rows } = await pool.query(
      `SELECT ro.*, rp.name AS product_name, e.name AS event_name, pu.status AS payment_status
        FROM reel_orders ro JOIN reel_products rp ON rp.id = ro.product_id
        LEFT JOIN events e ON e.id = ro.event_id
        LEFT JOIN purchases pu ON pu.id = ro.purchase_id
        ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
        ORDER BY ro.created_at DESC LIMIT 200`,
      params
    );
    res.json({ data: rows });
  }));

  app.patch('/admin/reel-orders/:id', needRole('ADMIN'), asyncH(async (req, res) => {
    const cur = await pool.query('SELECT * FROM reel_orders WHERE id = $1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'reel order not found' });
    const b = req.body || {};
    const from = cur.rows[0].status;
    if (b.status !== undefined) {
      if (!REEL_ORDER_FLOW[from].includes(b.status)) {
        return res.status(409).json({ error: `cannot move ${from} -> ${b.status}` });
      }
      if (['pending', 'in_production'].includes(b.status)) {
        const pay = await pool.query('SELECT status FROM purchases WHERE id = $1', [cur.rows[0].purchase_id]);
        if (pay.rows[0]?.status !== 'paid') {
          return res.status(409).json({ error: 'payment not completed yet' });
        }
      }
      if (b.status === 'ready' && !b.media_id && !cur.rows[0].media_id) {
        return res.status(400).json({ error: 'link {media_id} of the finished reel first' });
      }
    }
    const sets = [], vals = [];
    const set = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if (b.status !== undefined) set('status', b.status);
    // Showcase consent flag (set with buyer consent; independent of flow state).
    if (b.showcase !== undefined) set('showcase', !!b.showcase);
    if (b.media_id !== undefined) {
      if (b.media_id) {
        if (!UUID_RE.test(String(b.media_id))) return res.status(400).json({ error: 'bad media_id' });
        const m = await pool.query(`SELECT id FROM media WHERE id = $1 AND kind = 'reel'`, [String(b.media_id)]);
        if (!m.rows.length) return res.status(404).json({ error: 'reel media not found' });
        set('media_id', String(b.media_id));
      } else set('media_id', null);
    }
    if (!sets.length) return res.status(400).json({ error: 'nothing to update' });
    vals.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE reel_orders SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
    audit(req, 'reelorder.edit', 'reel_order', req.params.id, { from, to: b.status || from });
    res.json({ data: rows[0] });
  }));

  // ---- Photo credits (5-pack bundles): buy credits for 1 event x subject,
  // then unlock any N photos in that scope (no cart). Stills only.
  // Tables: credit_packs (admin price list, global + per-event) ->
  // credit_bundles (issued per buyer per subject) -> credit_redemptions.
  // See docs/MASTER_PLAN.md P1. Pack scope mirrors the subject it applies to.
  const CREDIT_SCOPE = ['rider', 'horse'];

  // Shared: does this buyer own this media via a credit redemption?
  // Inline EXISTS fragment; $uid = buyer_user_id param index, $mid = media id expression.
  const creditOwnedSql = ($uid, $mid) =>
    `EXISTS (SELECT 1 FROM credit_redemptions cr
       JOIN credit_bundles cb ON cb.id = cr.bundle_id
       JOIN purchases p2 ON p2.id = cb.purchase_id
       WHERE p2.status = 'paid' AND p2.buyer_user_id = ${$uid} AND cr.media_id = ${$mid})`;

  // Public: applicable credit pack for one event x subject (event-specific
  // first, global default fallback). Prices are admin-set (MASTER_PLAN §2).
  app.get('/api/credit-packs', asyncH(async (req, res) => {
    const { event_id, horse_id, rider_id } = req.query;
    if (!event_id || !UUID_RE.test(String(event_id))) return res.status(400).json({ error: 'need {event_id}' });
    if (!!horse_id === !!rider_id) {
      return res.status(400).json({ error: 'need exactly one of {horse_id, rider_id}' });
    }
    const scope = horse_id ? 'horse' : 'rider';
    const subjectId = String(horse_id || rider_id);
    if (!UUID_RE.test(subjectId)) return res.status(400).json({ error: 'bad subject id' });
    const { rows } = await pool.query(
      `SELECT * FROM credit_packs
        WHERE status = 'published' AND scope_type = $2
          AND (event_id = $1 OR event_id IS NULL)
        ORDER BY event_id NULLS LAST, sort_order LIMIT 1`,
      [String(event_id), scope]
    );
    res.json({ data: rows });
  }));

  // Buyer purchases a credit bundle (pay up front, same pattern as reel orders).
  app.post('/api/credit-orders', asyncH(async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: 'login required' });
    if (throttled(req.ip, 'credit-order')) return res.status(429).json({ error: 'too many requests, try again later' });
    const b = req.body || {};
    if (!b.pack_id || !UUID_RE.test(String(b.pack_id))) return res.status(400).json({ error: 'need {pack_id}' });
    if (!b.event_id || !UUID_RE.test(String(b.event_id))) return res.status(400).json({ error: 'need {event_id}' });
    if (!!b.horse_id === !!b.rider_id) {
      return res.status(400).json({ error: 'need exactly one of {horse_id, rider_id}' });
    }
    if (b.idempotency_key !== undefined && b.idempotency_key !== null &&
      !/^[A-Za-z0-9_-]{8,128}$/.test(String(b.idempotency_key))) {
      return res.status(400).json({ error: 'bad idempotency_key' });
    }
    const buyerEmail = normEmail(b.email || req.authUser.email);
    if (!EMAIL_RE.test(buyerEmail)) return res.status(400).json({ error: 'need a valid {email}' });
    const pack = await pool.query('SELECT * FROM credit_packs WHERE id = $1', [String(b.pack_id)]);
    if (!pack.rows.length || pack.rows[0].status !== 'published') {
      return res.status(404).json({ error: 'credit pack not found or not for sale' });
    }
    const p = pack.rows[0];
    if (p.event_id && p.event_id !== String(b.event_id)) {
      return res.status(400).json({ error: 'pack is for a different event' });
    }
    const scope = p.scope_type;
    const subjectCol = scope === 'horse' ? 'horse_id' : 'rider_id';
    const subjectId = String(b[subjectCol] || '');
    if (!UUID_RE.test(subjectId)) {
      return res.status(400).json({ error: `pack is ${scope}-scoped: need {${subjectCol}}` });
    }
    const ev = await pool.query('SELECT id FROM events WHERE id = $1', [String(b.event_id)]);
    if (!ev.rows.length) return res.status(404).json({ error: 'event not found' });
    const subj = await pool.query(
      `SELECT id FROM ${scope === 'horse' ? 'horses' : 'riders'} WHERE id = $1`, [subjectId]);
    if (!subj.rows.length) return res.status(404).json({ error: `${scope} not found` });
    if (!Number.isInteger(p.price_cents) || p.price_cents <= 0 || !Number.isInteger(p.slots) || p.slots <= 0) {
      return res.status(409).json({ error: 'pack has no valid price/slots' });
    }
    const amount = earlyPriceOf(p) ?? p.price_cents;
    if (!Number.isInteger(amount) || amount <= 0) {
      return res.status(409).json({ error: 'no price set for this pack' });
    }
    if (b.idempotency_key) {
      const prior = await pool.query(
        `SELECT cb.id AS bundle_id, pu.id AS purchase_id FROM credit_bundles cb
          JOIN purchases pu ON pu.id = cb.purchase_id
          WHERE pu.idempotency_key = $1 AND pu.buyer_user_id = $2`,
        [String(b.idempotency_key), req.authUser.id]
      ).catch(() => ({ rows: [] }));
      if (prior.rows.length) return res.status(200).json({ data: { ...prior.rows[0], reused: true } });
    }
    // subjectCol is pack scope validated against the CHECK constraint ('horse'|'rider').
    const { rows: brows } = await pool.query(
      `INSERT INTO credit_bundles
        (pack_id, event_id, ${subjectCol}, buyer_user_id, buyer_email, slots_total, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'awaiting_payment') RETURNING id`,
      [p.id, String(b.event_id), subjectId, req.authUser.id, buyerEmail, p.slots]
    );
    const bundleId = brows[0].id;
    let purchaseId;
    try {
      const { rows } = await pool.query(
        `INSERT INTO purchases (credit_bundle_id, buyer_email, buyer_user_id, license_tier, amount_cents, currency, status, idempotency_key)
          VALUES ($1, $2, $3, NULL, $4, 'NZD', 'pending', $5) RETURNING id`,
        [bundleId, buyerEmail, req.authUser.id, amount, b.idempotency_key || null]
      );
      purchaseId = rows[0].id;
    } catch (e) {
      await pool.query(`UPDATE credit_bundles SET status = 'cancelled' WHERE id = $1`, [bundleId]);
      throw e;
    }
    await pool.query(`UPDATE credit_bundles SET purchase_id = $2 WHERE id = $1`, [bundleId, purchaseId]);
    const label = `${p.slots}-photo credits`.slice(0, 120);
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      customer_email: buyerEmail,
      line_items: [{
        price_data: { currency: 'nzd', product_data: { name: label }, unit_amount: amount },
        quantity: 1,
      }],
      success_url: `${APP_URL}/photos/success?purchase=${purchaseId}`,
      cancel_url: `${APP_URL}/photos`,
      metadata: { purchase_id: purchaseId },
    }, { idempotencyKey: b.idempotency_key ? `cr-${b.idempotency_key}` : `cr-${purchaseId}` });
    await pool.query('UPDATE purchases SET stripe_session_id = $2 WHERE id = $1', [purchaseId, session.id]);
    res.status(201).json({ data: { bundle_id: bundleId, purchase_id: purchaseId, checkout_url: session.url } });
  }));

  // Buyer unlocks one photo with credits (re-downloads stay free afterwards).
  app.post('/api/credits/unlock', asyncH(async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: 'login required' });
    if (throttled(req.ip, 'credit-unlock')) return res.status(429).json({ error: 'too many requests, try again later' });
    const { media_id } = req.body || {};
    if (!media_id || !UUID_RE.test(String(media_id))) return res.status(400).json({ error: 'need {media_id}' });
    const m = await pool.query(
      `SELECT id, kind, status, event_id, horse_id, rider_id FROM media WHERE id = $1`, [String(media_id)]);
    if (!m.rows.length || m.rows[0].status !== 'published' || m.rows[0].kind !== 'photo') {
      return res.status(404).json({ error: 'photo not found' });
    }
    const media = m.rows[0];
    if (!media.event_id || (!media.horse_id && !media.rider_id)) {
      return res.status(409).json({ error: 'photo has no event/subject scope for credits' });
    }
    const dupe = await pool.query(
      `SELECT 1 FROM credit_redemptions cr JOIN credit_bundles cb ON cb.id = cr.bundle_id
        JOIN purchases pu ON pu.id = cb.purchase_id
        WHERE pu.status = 'paid' AND pu.buyer_user_id = $2 AND cr.media_id = $1 LIMIT 1`,
      [media.id, req.authUser.id]
    );
    if (dupe.rows.length) return res.status(200).json({ data: { unlocked: true, reused: true } });
    const { rows } = await pool.query(
      `SELECT cb.id, cb.slots_total,
          (SELECT COUNT(*)::INT FROM credit_redemptions WHERE bundle_id = cb.id) AS used
        FROM credit_bundles cb JOIN purchases pu ON pu.id = cb.purchase_id
        WHERE cb.status = 'active' AND pu.status = 'paid' AND pu.buyer_user_id = $1
          AND cb.event_id = $2
          AND ((cb.rider_id IS NOT NULL AND cb.rider_id = $3)
            OR (cb.horse_id IS NOT NULL AND cb.horse_id = $4))
        ORDER BY cb.created_at LIMIT 20`,
      [req.authUser.id, media.event_id, media.rider_id, media.horse_id]
    );
    const bundle = rows.find((r) => Number(r.slots_total) - Number(r.used) > 0);
    if (!bundle) return res.status(409).json({ error: 'no credits left for this event × subject (buy a 5-pack first)' });
    try {
      await pool.query(
        'INSERT INTO credit_redemptions (bundle_id, media_id) VALUES ($1, $2)', [bundle.id, media.id]);
    } catch (e) {
      if (e.code === '23505') return res.status(200).json({ data: { unlocked: true, reused: true } });
      throw e;
    }
    const left = Number(bundle.slots_total) - Number(bundle.used) - 1;
    res.status(201).json({ data: { unlocked: true, bundle_id: bundle.id, slots_left: left } });
  }));

  // Buyer: remaining credit balance per bundle (powers "n left" hints).
  app.get('/api/my/credits', asyncH(async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: 'login required' });
    const { rows } = await pool.query(
      `SELECT cb.id, cb.slots_total, cb.status, cb.event_id, cb.rider_id, cb.horse_id,
          e.name AS event_name, h.name AS horse, r.name AS rider,
          (SELECT COUNT(*)::INT FROM credit_redemptions WHERE bundle_id = cb.id) AS used
        FROM credit_bundles cb
        LEFT JOIN purchases pu ON pu.id = cb.purchase_id
        LEFT JOIN events e ON e.id = cb.event_id
        LEFT JOIN horses h ON h.id = cb.horse_id
        LEFT JOIN riders r ON r.id = cb.rider_id
        WHERE cb.buyer_user_id = $1 AND pu.status = 'paid' AND cb.status = 'active'
        ORDER BY cb.created_at DESC LIMIT 50`,
      [req.authUser.id]
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ data: rows.map((x) => ({ ...x, slots_left: Number(x.slots_total) - Number(x.used) })) });
  }));

  // ---- Admin: credit pack price list (all prices set here, no deploy) ----
  app.get('/admin/credit-packs', needRole('ADMIN'), asyncH(async (req, res) => {
    const params = [];
    let where = '';
    if (req.query.event_id) {
      if (!UUID_RE.test(String(req.query.event_id))) return res.status(400).json({ error: 'bad event_id' });
      params.push(String(req.query.event_id));
      where = `WHERE cp.event_id = $1`;
    }
    const { rows } = await pool.query(
      `SELECT cp.*, e.name AS event_name,
          (SELECT COUNT(*)::INT FROM credit_bundles WHERE pack_id = cp.id AND status <> 'cancelled') AS bundles
        FROM credit_packs cp LEFT JOIN events e ON e.id = cp.event_id
        ${where} ORDER BY cp.event_id NULLS LAST, cp.sort_order LIMIT 200`,
      params
    );
    res.json({ data: rows });
  }));

  app.post('/admin/credit-packs', needRole('ADMIN'), asyncH(async (req, res) => {
    const b = req.body || {};
    if (!CREDIT_SCOPE.includes(String(b.scope_type))) {
      return res.status(400).json({ error: 'scope_type must be rider|horse' });
    }
    const slots = parseInt(b.slots, 10);
    if (!Number.isInteger(slots) || slots <= 0) return res.status(400).json({ error: 'slots must be a positive integer' });
    const price = b.price_cents === '' || b.price_cents === null || b.price_cents === undefined
      ? null : parseInt(b.price_cents, 10);
    if (!(price >= 0)) return res.status(400).json({ error: 'price_cents must be a non-negative integer' });
    let eventId = null;
    if (b.event_id) {
      if (!UUID_RE.test(String(b.event_id))) return res.status(400).json({ error: 'bad event_id' });
      const ev = await pool.query('SELECT id FROM events WHERE id = $1', [String(b.event_id)]);
      if (!ev.rows.length) return res.status(404).json({ error: 'event not found' });
      eventId = String(b.event_id);
    }
    const photographer = await activePhotographer(pool, b.photographer_id);
    const { rows } = await pool.query(
      `INSERT INTO credit_packs (photographer_id, event_id, scope_type, slots, price_cents, sort_order, status)
        VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'published')) RETURNING *`,
      [photographer.id, eventId, String(b.scope_type), slots, price,
        Number.isInteger(parseInt(b.sort_order, 10)) ? parseInt(b.sort_order, 10) : 0,
        ['draft', 'published', 'archived'].includes(b.status) ? b.status : 'published']
    );
    audit(req, 'creditpack.create', 'credit_pack', rows[0].id, { slots, price_cents: price });
    res.status(201).json({ data: rows[0] });
  }));

  app.patch('/admin/credit-packs/:id', needRole('ADMIN'), asyncH(async (req, res) => {
    const b = req.body || {};
    const sets = [], vals = [];
    const set = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if (b.scope_type !== undefined) {
      if (!CREDIT_SCOPE.includes(String(b.scope_type))) return res.status(400).json({ error: 'scope_type must be rider|horse' });
      set('scope_type', String(b.scope_type));
    }
    if (b.slots !== undefined) {
      const slots = parseInt(b.slots, 10);
      if (!Number.isInteger(slots) || slots <= 0) return res.status(400).json({ error: 'slots must be a positive integer' });
      set('slots', slots);
    }
    if (b.price_cents !== undefined) {
      const price = b.price_cents === '' || b.price_cents === null ? null : parseInt(b.price_cents, 10);
      if (!(price >= 0)) return res.status(400).json({ error: 'price_cents must be a non-negative integer' });
      set('price_cents', price);
    }
    if (b.early_price_cents !== undefined) {
      const early = b.early_price_cents === '' || b.early_price_cents === null ? null : parseInt(b.early_price_cents, 10);
      if (early !== null && !(early >= 0)) return res.status(400).json({ error: 'early_price_cents must be a non-negative integer or null' });
      set('early_price_cents', early);
    }
    if (b.early_until !== undefined) {
      const until = !b.early_until ? null : new Date(b.early_until);
      if (until !== null && Number.isNaN(until.getTime())) return res.status(400).json({ error: 'early_until must be ISO datetime' });
      set('early_until', until ? until.toISOString() : null);
    }
    if (b.sort_order !== undefined) {
      const so = parseInt(b.sort_order, 10);
      if (!Number.isInteger(so)) return res.status(400).json({ error: 'sort_order must be an integer' });
      set('sort_order', so);
    }
    if (b.status !== undefined) {
      if (!['draft', 'published', 'archived'].includes(b.status)) {
        return res.status(400).json({ error: 'status must be draft|published|archived' });
      }
      set('status', b.status);
    }
    if (!sets.length) return res.status(400).json({ error: 'nothing to update' });
    vals.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE credit_packs SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
    if (!rows.length) return res.status(404).json({ error: 'credit pack not found' });
    audit(req, 'creditpack.edit', 'credit_pack', req.params.id, { fields: sets.map((s) => s.split(' = ')[0]) });
    res.json({ data: rows[0] });
  }));

  app.delete('/admin/credit-packs/:id', needRole('ADMIN'), asyncH(async (req, res) => {
    const live = await pool.query(
      `SELECT COUNT(*)::INT AS n FROM credit_bundles WHERE pack_id = $1 AND status <> 'cancelled'`,
      [req.params.id]);
    if (live.rows[0].n > 0) {
      return res.status(409).json({ error: 'has live bundles — archive instead of deleting' });
    }
    await pool.query(`DELETE FROM credit_bundles WHERE pack_id = $1 AND status = 'cancelled'`, [req.params.id]);
    const { rows } = await pool.query('DELETE FROM credit_packs WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'credit pack not found' });
    audit(req, 'creditpack.delete', 'credit_pack', req.params.id, {});
    res.json({ ok: true });
  }));

  // ---- In-app notifications (header bell now, email digests in P3) ----
  app.get('/api/my/notifications', asyncH(async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: 'login required' });
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const { rows } = await pool.query(
      `SELECT *, (SELECT COUNT(*)::INT FROM notifications WHERE user_id = $1 AND read_at IS NULL) AS unread
        FROM notifications WHERE user_id = $1
        ORDER BY read_at NULLS FIRST, updated_at DESC LIMIT $2`,
      [req.authUser.id, limit]
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ data: rows, unread: rows[0]?.unread ?? 0 });
  }));

  app.post('/api/my/notifications/read', asyncH(async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: 'login required' });
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((x) => UUID_RE.test(String(x))) : [];
    if (ids.length) {
      await pool.query(
        'UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND id = ANY($2::UUID[])',
        [req.authUser.id, ids]
      );
    } else {
      await pool.query(
        'UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL',
        [req.authUser.id]
      );
    }
    res.json({ ok: true });
  }));

  // ---- Takedown request (P3 privacy): anyone logged in can ask for a photo
  // to come down. Lands in correction_reports (existing /admin/corrections
  // triage, SLA 48h per privacy page); the admin archives the media and
  // resolves the report. Withdrawing consent always works — see privacy page.
  app.post('/api/media/:id/takedown', asyncH(async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: 'login required' });
    if (throttled(req.ip, 'media-takedown')) return res.status(429).json({ error: 'too many requests, try again later' });
    if (!UUID_RE.test(String(req.params.id))) return res.status(400).json({ error: 'bad id' });
    const m = await pool.query(
      `SELECT m.id, m.status, e.name AS event_name, h.name AS horse, r.name AS rider
        FROM media m LEFT JOIN events e ON e.id = m.event_id
        LEFT JOIN horses h ON h.id = m.horse_id LEFT JOIN riders r ON r.id = m.rider_id
        WHERE m.id = $1`,
      [req.params.id]
    );
    if (!m.rows.length) return res.status(404).json({ error: 'photo not found' });
    const reason = String(req.body?.reason || '').trim().slice(0, 500);
    const who = req.authUser.name || req.authUser.email || 'a user';
    const { rows } = await pool.query(
      `INSERT INTO correction_reports (name, email, subject, entity_type, entity_id, message)
        VALUES ($1, $2, 'Takedown request', 'photo', $3, $4) RETURNING id, created_at`,
      [who, req.authUser.email || '', String(req.params.id),
        `${who} (${req.authUser.email || 'no email'}) requests takedown of photo ${req.params.id} ` +
        `(${[m.rows[0].horse, m.rows[0].rider].filter(Boolean).join(' × ') || m.rows[0].event_name || 'untitled'}, status ${m.rows[0].status}). ` +
        `Reason: ${reason || '(none given)'}. SLA: review within 48h; archive the media if valid, then resolve.`]
    );
    audit(req, 'media.takedown', 'media', String(req.params.id), { report: rows[0].id });
    res.status(201).json({ data: { ok: true, report_id: rows[0].id } });
  }));

  // ---- "That's me" claim: personal shelf, never touches canonical tags ----
  // Family decision: claiming only saves the photo into the CLAIMANT's own
  // gallery (library "Claimed" section) so they can find and buy it. The
  // canonical horse_id/rider_id stays with the photographer/admin.
  // Guardrails: login + throttle + audit. No visibility/ownership change.
  // ---- Maintenance (P3): retention + checkout nudges ----
  // No cron infra in the stack: trigger from Admin → Data Tools, or schedule
  // Cloud Scheduler against this endpoint with MAINTENANCE_SECRET
  // (header x-maintenance-secret). Tasks:
  //   retention: delete R2 originals of draft/archived media older than 90
  //     days (DB rows stay; published work is never touched).
  //   nudges: one in-app reminder per stale pending purchase (>24h, logged-in
  //     buyer, never nudged before) linking back to the item.
  app.post('/admin/maintenance/run', asyncH(async (req, res) => {
    const okSecret = process.env.MAINTENANCE_SECRET &&
      req.headers['x-maintenance-secret'] === process.env.MAINTENANCE_SECRET;
    if (!okSecret && (!req.authUser || req.authUser.role !== 'ADMIN')) {
      return res.status(401).json({ error: 'admin login required' });
    }
    const tasks = Array.isArray(req.body?.tasks) && req.body.tasks.length
      ? req.body.tasks : ['retention', 'nudges'];
    const out = {};
    if (tasks.includes('retention')) {
      const { rows } = await pool.query(
        `SELECT id, storage_key, preview_key, thumb_key FROM media
          WHERE status <> 'published' AND storage_key IS NOT NULL
            AND created_at < NOW() - INTERVAL '90 days' LIMIT 500`
      );
      let cleaned = 0;
      for (const r of rows) {
        try {
          await mediaStore.deleteKeys([r.storage_key, r.preview_key, r.thumb_key]);
          await pool.query(
            'UPDATE media SET storage_key = NULL, preview_key = NULL, thumb_key = NULL WHERE id = $1',
            [r.id]
          );
          cleaned += 1;
        } catch { /* best-effort per row */ }
      }
      audit(req, 'maint.retention', 'media', null, { cleaned });
      out.retention = { cleaned, scanned: rows.length };
    }
    if (tasks.includes('nudges')) {
      const { rows } = await pool.query(
        `SELECT pu.id, pu.buyer_user_id, pu.media_id, pu.package_id,
            pu.amount_cents, m.id AS mid, e.name AS event_name,
            h.name AS horse, r.name AS rider, pk.title AS package_title
          FROM purchases pu
          LEFT JOIN media m ON m.id = pu.media_id
          LEFT JOIN events e ON e.id = m.event_id
          LEFT JOIN horses h ON h.id = m.horse_id LEFT JOIN riders r ON r.id = m.rider_id
          LEFT JOIN packages pk ON pk.id = pu.package_id
          WHERE pu.status = 'pending' AND pu.buyer_user_id IS NOT NULL
            AND pu.created_at < NOW() - INTERVAL '24 hours'
            AND NOT EXISTS (SELECT 1 FROM notifications n
              WHERE n.user_id = pu.buyer_user_id AND n.kind = 'order-update'
                AND n.ref_key = ('purchase:' || pu.id::TEXT))
          LIMIT 200`
      );
      let nudged = 0;
      for (const p of rows) {
        const title = p.mid
          ? [p.horse, p.rider].filter(Boolean).join(' × ') || p.event_name || 'your photo'
          : p.package_title || 'your order';
        const link = p.mid ? `/photos/${p.mid}` : '/photos/library';
        await pool.query(
          `INSERT INTO notifications (user_id, kind, title, body, link, ref_key, count)
            VALUES ($1, 'order-update', 'Still interested?', $2, $3, $4, 1)
            ON CONFLICT DO NOTHING`,
          [p.buyer_user_id, `"${title}" is waiting for payment`, link, `purchase:${p.id}`]
        );
        nudged += 1;
      }
      audit(req, 'maint.nudges', 'purchase', null, { nudged });
      out.nudges = { nudged };
    }
    res.json({ data: out });
  }));

  app.post('/api/media/:id/claim', asyncH(async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: 'login required' });
    if (throttled(req.ip, 'media-claim')) return res.status(429).json({ error: 'too many requests, try again later' });
    if (!UUID_RE.test(String(req.params.id))) return res.status(400).json({ error: 'bad id' });
    const b = req.body || {};
    if (!!b.horse_id === !!b.rider_id) {
      return res.status(400).json({ error: 'claim exactly one of {horse_id, rider_id}' });
    }
    const m = await pool.query('SELECT id, status FROM media WHERE id = $1', [req.params.id]);
    if (!m.rows.length || m.rows[0].status !== 'published') {
      return res.status(404).json({ error: 'photo not found' });
    }
    const kind = b.horse_id ? 'horse' : 'rider';
    const sid = String(b.horse_id || b.rider_id);
    if (!UUID_RE.test(sid)) return res.status(400).json({ error: 'bad subject id' });
    const subj = await pool.query(
      `SELECT name FROM ${kind === 'horse' ? 'horses' : 'riders'} WHERE id = $1`, [sid]);
    if (!subj.rows.length) return res.status(404).json({ error: `${kind} not found` });
    const horseCol = kind === 'horse' ? sid : null;
    const riderCol = kind === 'rider' ? sid : null;
    const { rowCount } = await pool.query(
      `INSERT INTO claimed_photos (user_id, media_id, claimed_horse_id, claimed_rider_id)
        VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [req.authUser.id, String(req.params.id), horseCol, riderCol]
    );
    audit(req, 'media.claim', 'media', String(req.params.id),
      { kind, as: sid, personal: true, by: req.authUser.id });
    res.status(rowCount ? 201 : 200).json({
      data: { ok: true, kind, name: subj.rows[0].name, reused: !rowCount },
    });
  }));

  // Claimant's personal shelf (powers the library "Claimed" section).
  app.get('/api/my/claimed', asyncH(async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: 'login required' });
    const { rows } = await pool.query(
      `SELECT m.id, m.kind, m.thumb_key, m.preview_key, m.event_id,
          e.name AS event_name, h.name AS horse, r.name AS rider,
          ch.name AS claimed_horse, cr.name AS claimed_rider, cp.created_at
        FROM claimed_photos cp
        JOIN media m ON m.id = cp.media_id AND m.status = 'published'
        LEFT JOIN events e ON e.id = m.event_id
        LEFT JOIN horses h ON h.id = m.horse_id LEFT JOIN riders r ON r.id = m.rider_id
        LEFT JOIN horses ch ON ch.id = cp.claimed_horse_id
        LEFT JOIN riders cr ON cr.id = cp.claimed_rider_id
        WHERE cp.user_id = $1 ORDER BY cp.created_at DESC LIMIT 100`,
      [req.authUser.id]
    );
    for (const x of rows) {
      try {
        if (x.preview_key) x.preview_url = mediaStore.publicUrl(x.preview_key);
        if (x.thumb_key) x.thumb_url = mediaStore.publicUrl(x.thumb_key);
      } catch { /* R2 public base unconfigured */ }
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ data: rows });
  }));

  // Early-bird pricing (P1b): an admin-set discounted price honored while
  // active (early_until null = no deadline). Applied to packages + credits.
  const earlyPriceOf = (row) => {
    if (row.early_price_cents === null || row.early_price_cents === undefined) return null;
    const early = parseInt(row.early_price_cents, 10);
    if (!(early >= 0)) return null;
    if (row.early_until && new Date(row.early_until) <= new Date()) return null;
    return early;
  };

  // ---- Assisted tagging: rank classes by taken_at proximity, with candidates ----
  app.post('/admin/media/suggest-tags', needRole('ADMIN'), asyncH(async (req, res) => {
    const { event_id, taken_at } = req.body || {};
    if (!event_id) return res.status(400).json({ error: 'need {event_id}' });
    const ts = taken_at ? new Date(taken_at) : null;
    if (taken_at && Number.isNaN(ts.getTime())) return res.status(400).json({ error: 'taken_at must be ISO datetime' });
    const classes = await pool.query(
      `SELECT c.id, c.name, c.class_date, c.start_time, c.height_cm, COUNT(rr.id)::INT AS rounds
        FROM classes c LEFT JOIN round_results rr ON rr.class_id = c.id
        WHERE c.event_id = $1 GROUP BY c.id ORDER BY c.class_date NULLS LAST, c.start_time NULLS LAST`,
      [event_id]
    );
    const out = [];
    for (const c of classes.rows) {
      let score = 50;
      if (ts && c.class_date) {
        const day = new Date(c.class_date);
        const diffH = Math.abs(ts - day) / 36e5;
        score = Math.max(0, 100 - diffH);
        if (c.start_time && String(c.start_time).length >= 4) {
          const [hh, mm] = String(c.start_time).split(':').map(Number);
          if (Number.isFinite(hh)) {
            const start = new Date(day);
            start.setHours(hh, mm || 0, 0, 0);
            score = Math.max(0, 100 - Math.abs(ts - start) / 36e5);
          }
        }
      }
      const pairs = await pool.query(
        `SELECT DISTINCT h.id AS horse_id, h.name AS horse, r.id AS rider_id, r.name AS rider,
           COUNT(*)::INT AS rounds
          FROM round_results rr JOIN horses h ON h.id = rr.horse_id JOIN riders r ON r.id = rr.rider_id
          WHERE rr.class_id = $1 GROUP BY 1, 2, 3, 4 ORDER BY rounds DESC LIMIT 30`,
        [c.id]
      );
      out.push({ class_id: c.id, name: c.name, class_date: c.class_date, height_cm: c.height_cm, rounds: c.rounds, score: Math.round(score * 10) / 10, candidates: pairs.rows });
    }
    out.sort((a, b) => b.score - a.score);
    res.json({ data: out });
  }));
};
