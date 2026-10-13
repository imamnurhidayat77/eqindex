const express = require('express');
const pool = require('../db');
const { asyncH } = require('../lib/async');
const { needRole } = require('../lib/auth');
const { audit } = require('../lib/audit');
const { resolveId } = require('../lib/resolve');
const multer = require('multer');
const sharp = require('sharp');
const mediaStore = require('../lib/mediaStore');

const stripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    const err = new Error('stripe unconfigured (STRIPE_SECRET_KEY)');
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

  // ---- Public catalog (published only; previews/thumbs are CDN-public) ----
  app.get('/photos', asyncH(async (req, res) => {
    const conds = [`m.status = 'published'`], params = [];
    const push = (sql, v) => { params.push(v); conds.push(sql.replace('?', `$${params.length}`)); };
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
          m.price_cents, m.license_default, m.moment, m.created_at,
          e.name AS event_name, h.name AS horse, r.name AS rider,
          p.name AS photographer
        FROM media m LEFT JOIN events e ON e.id = m.event_id
        LEFT JOIN horses h ON h.id = m.horse_id LEFT JOIN riders r ON r.id = m.rider_id
        JOIN photographers p ON p.id = m.photographer_id
        WHERE ${conds.join(' AND ')}
        ORDER BY m.created_at DESC LIMIT $${params.length}`,
      params
    );
    withUrls(rows);
    res.json({ data: rows });
  }));

  app.get('/photos/:id', asyncH(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT m.*, e.name AS event_name, e.date_start AS event_date,
          c.name AS class_name, h.name AS horse, r.name AS rider,
          p.name AS photographer
        FROM media m LEFT JOIN events e ON e.id = m.event_id
        LEFT JOIN classes c ON c.id = m.class_id
        LEFT JOIN horses h ON h.id = m.horse_id LEFT JOIN riders r ON r.id = m.rider_id
        JOIN photographers p ON p.id = m.photographer_id
        WHERE m.id = $1 AND m.status = 'published'`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'photo not found' });
    withUrls(rows);
    const rel = await pool.query(
      `SELECT id, thumb_key, kind FROM media
        WHERE status = 'published' AND id <> $1
          AND (event_id = $2 OR horse_id = $3 OR rider_id = $4)
        ORDER BY created_at DESC LIMIT 8`,
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

  // POST /api/checkout {media_id|package_id, license_tier?, email?}
  app.post('/api/checkout', asyncH(async (req, res) => {
    const { media_id, package_id, license_tier, email } = req.body || {};
    if (!!media_id === !!package_id) {
      return res.status(400).json({ error: 'need exactly one of {media_id, package_id}' });
    }
    const buyerEmail = (email || req.authUser?.email || '').trim();
    if (!buyerEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(buyerEmail)) {
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
      const row = m.rows[0];
      if (tierId && !row.tier_label) return res.status(400).json({ error: 'unknown license tier' });
      if (!tierId) {
        const dflt = await pool.query('SELECT * FROM license_tiers WHERE id = $1', [row.license_default || 'web']);
        tierId = dflt.rows[0]?.id || 'web';
        amount = dflt.rows[0]?.price_cents ?? row.price_cents;
      } else {
        amount = row.tier_price;
      }
      if (row.price_cents !== null && tierId === row.license_default) amount = Math.min(amount ?? Infinity, row.price_cents);
      if (amount === null || amount === undefined) return res.status(409).json({ error: 'no price set for this photo' });
      title = `${row.horse_id || row.rider_id ? '' : 'Event '}photo${row.moment ? ` (${row.moment})` : ''} · ${tierId}`;
      mediaId = row.id;
    } else {
      const pk = await pool.query(`SELECT * FROM packages WHERE id = $1 AND status = 'published'`, [package_id]);
      if (!pk.rows.length) return res.status(404).json({ error: 'package not found or not for sale' });
      amount = pk.rows[0].price_cents;
      title = pk.rows[0].title;
      packageId = pk.rows[0].id;
    }
    const { rows } = await pool.query(
      `INSERT INTO purchases (media_id, package_id, buyer_email, buyer_user_id, license_tier, amount_cents, currency, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'NZD', 'pending') RETURNING id`,
      [mediaId, packageId, buyerEmail, req.authUser?.id || null, tierId, amount]
    );
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
      success_url: `${APP_URL}/photos/success?purchase=${rows[0].id}`,
      cancel_url: `${APP_URL}/photos`,
      metadata: { purchase_id: rows[0].id },
    });
    await pool.query('UPDATE purchases SET stripe_session_id = $2 WHERE id = $1', [rows[0].id, session.id]);
    res.status(201).json({ data: { purchase_id: rows[0].id, checkout_url: session.url } });
  }));

  // Stripe webhook — must see the RAW body (registered before express.json).
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), asyncH(async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
      event = stripe().webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (e) {
      return res.status(400).json({ error: `webhook signature failed: ${e.message}` });
    }
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const purchaseId = session.metadata?.purchase_id;
      if (purchaseId) {
        const done = await pool.query(
          `UPDATE purchases SET status = 'paid'
            WHERE id = $1 AND status = 'pending' RETURNING id, media_id, package_id`,
          [purchaseId]
        );
        if (done.rows.length) {
          const r = done.rows[0];
          await pool.query(
            `UPDATE media SET purchase_count = purchase_count + 1 WHERE id = $1
              OR id IN (SELECT media_id FROM package_items WHERE package_id = $2)`,
            [r.media_id, r.package_id]
          );
          audit(req, 'media.purchase', 'purchase', purchaseId, { session: session.id });
        }
      }
    } else if (event.type === 'charge.refunded') {
      const pi = event.data.object?.payment_intent;
      if (pi) {
        await pool.query(
          `UPDATE purchases SET status = 'refunded' WHERE stripe_session_id IN
            (SELECT id FROM stripe_checkout_sessions WHERE payment_intent = $1)`, [pi]
        ).catch(() => pool.query(
          `UPDATE purchases SET status = 'refunded' WHERE id IN
            (SELECT (metadata->>'purchase_id')::UUID FROM stripe_events WHERE id = $1)`, [event.id]
        ).catch(() => {}));
      }
    }
    res.json({ received: true });
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

  // Download: entitlement check → 302 to signed R2 URL (15 min).
  app.get('/api/media/:id/download', asyncH(async (req, res) => {
    const email = (req.query.email || req.authUser?.email || '').trim().toLowerCase();
    const m = await pool.query('SELECT * FROM media WHERE id = $1 AND status = $2', [req.params.id, 'published']);
    if (!m.rows.length) return res.status(404).json({ error: 'photo not found' });
    if (!m.rows[0].storage_key) return res.status(409).json({ error: 'original not stored yet' });
    const ent = email ? await pool.query(
      `SELECT 1 FROM purchases
        WHERE status = 'paid' AND lower(buyer_email) = $2
          AND (media_id = $1 OR package_id IN (SELECT package_id FROM package_items WHERE media_id = $1))
        LIMIT 1`,
      [req.params.id, email]
    ) : { rows: [] };
    if (!ent.rows.length) return res.status(402).json({ error: 'purchase required' });
    res.redirect(302, await mediaStore.signedDownloadUrl(m.rows[0].storage_key));
  }));

  // Buyer library ("my photos").
  app.get('/api/my/photos', asyncH(async (req, res) => {
    const email = (req.query.email || req.authUser?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'need {email}' });
    const { rows } = await pool.query(
      `SELECT pu.id AS purchase_id, pu.license_tier, pu.amount_cents, pu.status, pu.created_at,
          m.id AS media_id, m.kind, m.thumb_key, m.preview_key, m.event_id,
          e.name AS event_name, h.name AS horse, r.name AS rider
        FROM purchases pu LEFT JOIN media m ON m.id = pu.media_id
        LEFT JOIN events e ON e.id = m.event_id
        LEFT JOIN horses h ON h.id = m.horse_id LEFT JOIN riders r ON r.id = m.rider_id
        WHERE lower(pu.buyer_email) = $1 AND pu.status = 'paid'
        ORDER BY pu.created_at DESC LIMIT 200`,
      [email]
    );
    withUrls(rows);
    res.json({ data: rows });
  }));

  // Admin: sales CSV export (plan §9 settlement).
  app.get('/admin/sales.csv', needRole('ADMIN'), asyncH(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT pu.created_at, pu.buyer_email, pu.license_tier, pu.amount_cents, pu.currency, pu.status,
          e.name AS event_name, h.name AS horse, r.name AS rider, pk.title AS package_title
        FROM purchases pu LEFT JOIN media m ON m.id = pu.media_id
        LEFT JOIN events e ON e.id = m.event_id
        LEFT JOIN horses h ON h.id = m.horse_id LEFT JOIN riders r ON r.id = m.rider_id
        LEFT JOIN packages pk ON pk.id = pu.package_id
        ORDER BY pu.created_at DESC LIMIT 5000`
    );
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['created_at,buyer_email,license_tier,amount_cents,currency,status,event,horse,rider,package',
      ...rows.map((r) => [r.created_at, r.buyer_email, r.license_tier, r.amount_cents, r.currency, r.status, r.event_name, r.horse, r.rider, r.package_title].map(q).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="eqindex-sales.csv"');
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

  // Admin sales table.
  app.get('/admin/sales', needRole('ADMIN'), asyncH(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const { rows } = await pool.query(
      `SELECT pu.*, e.name AS event_name, h.name AS horse, r.name AS rider, pk.title AS package_title
        FROM purchases pu LEFT JOIN media m ON m.id = pu.media_id
        LEFT JOIN events e ON e.id = m.event_id
        LEFT JOIN horses h ON h.id = m.horse_id LEFT JOIN riders r ON r.id = m.rider_id
        LEFT JOIN packages pk ON pk.id = pu.package_id
        ORDER BY pu.created_at DESC LIMIT $1`,
      [limit]
    );
    const totals = await pool.query(
      `SELECT COUNT(*)::INT AS sales, COALESCE(SUM(amount_cents), 0)::INT AS gross_cents
        FROM purchases WHERE status = 'paid'`
    );
    res.json({ data: rows, totals: totals.rows[0] });
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
      `SELECT id, COALESCE(price_cents, 0) AS price_cents FROM media
        WHERE status = 'published' AND event_id = $1 AND ${who.col} = $2`,
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
      `SELECT pk.*, (SELECT COUNT(*)::INT FROM package_items WHERE package_id = pk.id) AS items
        FROM packages pk WHERE ${conds.join(' AND ')} ORDER BY pk.price_cents LIMIT 10`,
      params
    );
    res.json({ data: rows });
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
