const pool = require('../db');
const { asyncH } = require('../lib/async');
const { needRole } = require('../lib/auth');
const { audit } = require('../lib/audit');
const { resolveId } = require('../lib/resolve');
const multer = require('multer');
const sharp = require('sharp');
const mediaStore = require('../lib/mediaStore');

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
  const size = Math.max(28, Math.round(Math.min(w, h) / 12));
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><pattern id="wm" width="340" height="120" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)">` +
    `<text x="10" y="60" font-family="sans-serif" font-size="${size}" font-weight="bold" fill="white" fill-opacity="0.28">${escXml(text)}</text>` +
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
          const wm = watermarkSvg(1600, Math.round(1600 * (meta.height || 1000) / (meta.width || 1600)), `${photographer.name} • PREVIEW ONLY`);
          const thumb = await sharp(f.buffer).rotate().resize({ width: 640, withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
          const preview = await sharp(f.buffer).rotate().resize({ width: 1600, withoutEnlargement: true })
            .composite([{ input: wm, blend: 'over' }]).jpeg({ quality: 80 }).toBuffer();
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

  // ---- Review queue ----
  app.get('/admin/media', needRole('ADMIN'), asyncH(async (req, res) => {
    const conds = [], params = [];
    const push = (sql, v) => { params.push(v); conds.push(sql.replace('?', `$${params.length}`)); };
    if (req.query.status) push('m.status = ?', String(req.query.status));
    if (req.query.event_id) push('m.event_id = ?', String(req.query.event_id));
    if (req.query.kind) push('m.kind = ?', String(req.query.kind));
    if (req.query.untagged === '1') conds.push('(m.horse_id IS NULL OR m.rider_id IS NULL)');
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    params.push(limit);
    const { rows } = await pool.query(
      `SELECT m.*, e.name AS event_name, h.name AS horse, r.name AS rider
        FROM media m LEFT JOIN events e ON e.id = m.event_id
        LEFT JOIN horses h ON h.id = m.horse_id LEFT JOIN riders r ON r.id = m.rider_id
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
    const set = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
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
    if (b.price_cents !== undefined) set('price_cents', b.price_cents === null ? null : Math.max(0, parseInt(b.price_cents, 10) || 0));
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
    res.json({ data: rows[0] });
  }));

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
