// Merch orders (Imam, 2026-11-24): the buyer sends a design with sizes and
// quantities, an admin checks the artwork and sends a proof, the buyer pays
// after approving it (payment lands in a later phase). Prices are always
// re-quoted here with the same rules the designer shows (src/lib/merch is a
// copy of web-bossmedia/lib, kept identical by merch-sync.test.mjs).
const crypto = require('crypto');
const multer = require('multer');
const pool = require('../db');
const { asyncH } = require('../lib/async');
const { audit } = require('../lib/audit');
const { EMAIL_RE, needRole } = require('../lib/auth');
const { UUID_RE } = require('../lib/resolve');
const { throttled } = require('../lib/ratelimit');
const mediaStore = require('../lib/mediaStore');
const { APP_URL } = require('../config');

let merchLib = null;
const lib = () => (merchLib ||= Promise.all([import('../lib/merch/merch.mjs'), import('../lib/merch/merch-config.mjs')])
  .then(([m, c]) => ({ ...m, ...c })));

const SETTINGS_KEY = 'merch_order_settings';
const LOGO_MAX_BYTES = 10 * 1024 * 1024; // print artwork, larger than photo logos
const LOGO_MIMES = ['image/png', 'image/jpeg'];
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const NZ_POSTCODE_RE = /^\d{4}$/;
const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const newRef = () => `BM-${Array.from({ length: 6 }, () => REF_ALPHABET[crypto.randomInt(REF_ALPHABET.length)]).join('')}`;
const newSecret = () => crypto.randomBytes(24).toString('base64url');
const str = (v, max) => String(v ?? '').trim().slice(0, max);

async function loadSettings(m) {
  const { rows } = await pool.query('SELECT value FROM admin_settings WHERE key = $1', [SETTINGS_KEY]);
  let stored = {};
  try { stored = rows.length ? JSON.parse(rows[0].value) : {}; } catch { stored = {}; }
  return m.merchOrderSettings(stored);
}

// Pure shape check of an order body (no DB). Returns { values, errors }.
// Slot values are checked for form here; whether a sponsor logo or an
// upload really exists is checked against the DB by the route.
function parseOrderInput(body, m) {
  const b = body || {};
  const errors = [];
  const product = m.merchProduct(b.productId);
  if (!product) return { values: null, errors: ['unknown product'] };
  const color = String(b.color || '');
  if (!m.isMerchColor(product.id, color)) errors.push('colour not offered for this product');

  const rawLines = Array.isArray(b.lines) ? b.lines : [];
  const lines = [];
  const seen = new Set();
  for (const l of rawLines.slice(0, m.MERCH_ORDER_RULES.maxLines + 1)) {
    const size = String(l?.size || '');
    const qty = Number(l?.qty);
    if (!m.isMerchSize(product.id, size)) { errors.push(`size ${str(size, 20)} not offered`); continue; }
    if (!Number.isInteger(qty) || qty < 1 || qty > m.MERCH_ORDER_RULES.maxUnitsPerLine) { errors.push(`quantity for ${size} must be 1 to ${m.MERCH_ORDER_RULES.maxUnitsPerLine}`); continue; }
    if (seen.has(size)) { errors.push(`size ${size} listed twice`); continue; }
    seen.add(size);
    lines.push({ size, qty });
  }
  if (rawLines.length > m.MERCH_ORDER_RULES.maxLines) errors.push('too many size rows');
  if (!lines.length && !errors.length) errors.push('add at least one size and quantity');

  const allowed = new Set(m.merchPositions(product.id).map((p) => p.id));
  const slots = {};
  const sponsorLogoIds = new Set();
  const uploadIds = new Set();
  const personalLogoIds = new Set();
  for (const [pos, raw] of Object.entries(b.slots || {})) {
    const v = String(raw || '');
    if (!v) continue;
    if (!allowed.has(pos)) { errors.push(`unknown logo slot ${str(pos, 30)}`); continue; }
    if (v.startsWith('club:')) {
      if (!m.merchClub(v.slice(5))) { errors.push(`unknown club logo in ${pos}`); continue; }
    } else if (v.startsWith('mlogo:')) {
      if (!UUID_RE.test(v.slice(6))) { errors.push(`bad uploaded logo in ${pos}`); continue; }
      uploadIds.add(v.slice(6));
    } else if (v.startsWith('my:')) {
      if (!UUID_RE.test(v.slice(3))) { errors.push(`bad saved logo in ${pos}`); continue; }
      personalLogoIds.add(v.slice(3));
    } else if (UUID_RE.test(v)) {
      sponsorLogoIds.add(v);
    } else { errors.push(`bad logo in ${pos}`); continue; }
    slots[pos] = v;
  }
  const slotZoom = {};
  const slotShift = {};
  for (const pos of Object.keys(slots)) {
    const z = Number(b.slotZoom?.[pos]);
    if (Number.isFinite(z)) slotZoom[pos] = Math.min(125, Math.max(m.LOGO_ZOOM_MIN * 100, Math.round(z)));
    const s = b.slotShift?.[pos];
    if (s && typeof s === 'object') {
      slotShift[pos] = { x: m.clampShift(s.x), y: m.clampShift(s.y), r: m.clampSpin(s.r), f: !!s.f };
    }
  }

  const c = b.contact || {};
  const name = str(c.name, 100);
  const email = str(c.email, 254).toLowerCase();
  const phone = str(c.phone, 30);
  const club = str(c.club, 100);
  if (name.length < 2) errors.push('name is required');
  if (!EMAIL_RE.test(email)) errors.push('a valid email is required');
  if (phone && !/^[+\d][\d\s()-]{5,29}$/.test(phone)) errors.push('phone number looks wrong');

  const delivery = b.delivery === 'pickup' ? 'pickup' : b.delivery === 'courier' ? 'courier' : null;
  if (!delivery) errors.push('choose courier or club pickup');
  let address = null;
  if (delivery === 'courier') {
    const a = b.address || {};
    address = { line1: str(a.line1, 120), line2: str(a.line2, 120), city: str(a.city, 60), postcode: str(a.postcode, 4) };
    if (address.line1.length < 3) errors.push('street address is required');
    if (address.city.length < 2) errors.push('town or city is required');
    if (!NZ_POSTCODE_RE.test(address.postcode)) errors.push('NZ postcode must be 4 digits');
  }
  if (delivery === 'pickup' && !club) errors.push('club name is required for club pickup');

  const claims = Array.isArray(b.uploads) ? b.uploads.slice(0, 20)
    .filter((u) => UUID_RE.test(String(u?.id || '')) && typeof u?.secret === 'string')
    .map((u) => ({ id: String(u.id), secret: String(u.secret).slice(0, 64) })) : [];
  for (const id of uploadIds) if (!claims.some((u) => u.id === id)) errors.push('uploaded logo is missing its key, upload it again');

  return {
    values: {
      product, color, lines, slots, slotZoom, slotShift, sponsorLogoIds: [...sponsorLogoIds], uploadIds: [...uploadIds],
      personalLogoIds: [...personalLogoIds],
      claims, contact: { name, email, phone: phone || null, club: club || null }, delivery, address,
      notes: str(b.notes, 500) || null,
    },
    errors,
  };
}

// Funded discount per sponsor logo: the best active merchandise budget
// (applies_to merch, migration 109) of its sponsor with enough left for one
// more discount. Photo budgets never discount merch. Unfunded logos discount nothing.
async function sponsorDiscounts(logoIds) {
  if (!logoIds.length) return {};
  const { rows } = await pool.query(
    `SELECT l.id AS logo_id, s.id AS sponsor_id, s.name AS sponsor_name,
       COALESCE((SELECT MAX(b.discount_cents) FROM sponsor_budgets b
         WHERE b.sponsor_id = s.id AND b.status = 'active' AND (b.ends_on IS NULL OR b.ends_on >= CURRENT_DATE)
           AND b.discount_cents > 0 AND (b.agreed_cents - b.spent_cents) >= b.discount_cents
           AND b.applies_to = 'merch'), 0) AS discount_cents
     FROM sponsor_logos l JOIN sponsors s ON s.id = l.sponsor_id
     WHERE l.id = ANY($1::UUID[]) AND l.is_active AND s.is_active AND s.kind = 'official'`,
    [logoIds]);
  return Object.fromEntries(rows.map((r) => [r.logo_id, r]));
}

function publicOrder(o, lines) {
  return {
    ref: o.ref, status: o.status, productId: o.product_id, color: o.color, design: o.design,
    delivery: o.delivery, address: o.address, notes: o.notes, quote: o.quote,
    totalCents: o.total_cents, currency: o.currency, createdAt: o.created_at, updatedAt: o.updated_at,
    contact: { name: o.buyer_name, email: o.buyer_email, phone: o.buyer_phone, club: o.club_name },
    lines: lines.map((l) => ({ size: l.size, qty: l.qty })),
  };
}

module.exports = function mountMerchRoutes(app) {
  // Live order settings, so the designer's estimate matches the server.
  app.get('/api/merch/settings', asyncH(async (req, res) => {
    const m = await lib();
    res.json({ data: await loadSettings(m) });
  }));

  // Admin only: delivery prices, pickup on/off, sponsor cap per order.
  app.put('/admin/merch/settings', needRole('ADMIN'), asyncH(async (req, res) => {
    const m = await lib();
    const b = req.body || {};
    const errors = [];
    const cents = (k) => {
      const v = Number(b[k]);
      if (!Number.isInteger(v) || v < 0 || v > 1000000) errors.push(`${k} must be whole cents, 0 to 1000000`);
      return v;
    };
    const next = { courierCents: cents('courierCents'), freeOverCents: cents('freeOverCents'), sponsorCapCents: cents('sponsorCapCents') };
    if (typeof b.pickupEnabled !== 'boolean') errors.push('pickupEnabled must be true or false');
    next.pickupEnabled = b.pickupEnabled;
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    await pool.query(
      `INSERT INTO admin_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [SETTINGS_KEY, JSON.stringify(next)]);
    audit(req, 'merch.settings.edit', 'admin_settings', SETTINGS_KEY, next);
    res.json({ data: m.merchOrderSettings(next) });
  }));

  // Buyer artwork for an order. Guests allowed: the returned secret is the
  // only way to attach it to an order, so one buyer can never use another's.
  const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LOGO_MAX_BYTES, files: 1 } });
  app.post('/api/merch/logos', logoUpload.single('logo'), asyncH(async (req, res) => {
    if (await throttled(pool, req.ip, 'merch-logo', 30)) return res.status(429).json({ error: 'too many uploads, try again later' });
    const f = req.file;
    if (!f?.buffer?.length) return res.status(400).json({ error: 'choose a PNG or JPEG logo up to 10 MB' });
    const { fileTypeFromBuffer } = await import('file-type');
    const real = (await fileTypeFromBuffer(f.buffer).catch(() => null))?.mime || '';
    if (!LOGO_MIMES.includes(real)) return res.status(400).json({ error: 'logo must be a real PNG or JPEG image' });
    const meta = await require('sharp')(f.buffer).metadata().catch(() => null);
    if (!meta?.width || !meta?.height) return res.status(400).json({ error: 'logo image could not be read' });
    const secret = newSecret();
    const ins = await pool.query(
      `INSERT INTO merch_order_logos (claim_hash, mime, bytes, width, height) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [sha256(secret), real, f.buffer.length, meta.width, meta.height]);
    const id = ins.rows[0].id;
    const key = `merch/logos/${id}.${real === 'image/png' ? 'png' : 'jpg'}`;
    try {
      await mediaStore.putBuffer(key, f.buffer, real);
    } catch {
      await pool.query('DELETE FROM merch_order_logos WHERE id = $1', [id]).catch(() => {});
      return res.status(502).json({ error: 'logo storage unavailable, try again shortly' });
    }
    await pool.query('UPDATE merch_order_logos SET r2_key = $2 WHERE id = $1', [id, key]);
    res.status(201).json({ data: { id, secret, width: meta.width, height: meta.height } });
  }));

  app.post('/api/merch/orders', asyncH(async (req, res) => {
    if (await throttled(pool, req.ip, 'merch-order', 10)) return res.status(429).json({ error: 'too many orders, try again later' });
    const m = await lib();
    const { values: v, errors } = parseOrderInput(req.body, m);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    // Saved account logos ("My sponsor logos", shared with photos) work
    // only for their owner, same rule as photo checkout.
    if (v.personalLogoIds.length) {
      if (!req.authUser) return res.status(401).json({ error: 'log in to use your saved logos' });
      const own = await pool.query(
        `SELECT l.id FROM sponsor_logos l JOIN sponsors s ON s.id = l.sponsor_id
         WHERE l.id = ANY($1::UUID[]) AND l.is_active AND s.is_active AND s.kind = 'personal' AND s.user_id = $2`,
        [v.personalLogoIds, req.authUser.id]);
      if (own.rowCount !== v.personalLogoIds.length) return res.status(403).json({ error: 'a saved logo is not available to you' });
    }
    const funded = await sponsorDiscounts(v.sponsorLogoIds);
    const missing = v.sponsorLogoIds.filter((id) => !funded[id]);
    if (missing.length) return res.status(400).json({ error: 'a sponsor logo is no longer available, pick another' });
    const settings = await loadSettings(m);
    const quote = m.quoteMerchOrder(v.product.id, v.slots, v.lines, {
      strict: true,
      discountFor: (id) => Number(funded[id]?.discount_cents) || 0,
      sponsorOf: (id) => funded[id]?.sponsor_id || id,
      labelFor: (id) => funded[id]?.sponsor_name || (String(id).startsWith('club:') ? 'Club logo' : 'Your logo'),
    }, v.delivery, settings);
    if (!quote) return res.status(400).json({ error: 'this delivery option is not available' });

    const secret = newSecret();
    const client = await pool.connect();
    let order;
    try {
      await client.query('BEGIN');
      for (let attempt = 0; attempt < 5 && !order; attempt++) {
        const r = await client.query(
          `INSERT INTO merch_orders (ref, access_hash, buyer_user_id, buyer_email, buyer_name, buyer_phone, club_name,
             product_id, color, design, delivery, address, notes, quote, total_cents)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (ref) DO NOTHING RETURNING *`,
          [newRef(), sha256(secret), req.authUser?.id || null, v.contact.email, v.contact.name, v.contact.phone, v.contact.club,
            v.product.id, v.color, JSON.stringify({ slots: v.slots, slotZoom: v.slotZoom, slotShift: v.slotShift }),
            v.delivery, v.address ? JSON.stringify(v.address) : null, v.notes, JSON.stringify(quote), quote.totalCents]);
        order = r.rows[0];
      }
      if (!order) throw new Error('could not allocate an order reference');
      for (const l of v.lines) {
        await client.query('INSERT INTO merch_order_lines (order_id, size, qty) VALUES ($1, $2, $3)', [order.id, l.size, l.qty]);
      }
      for (const id of v.uploadIds) {
        const claim = v.claims.find((u) => u.id === id);
        const r = await client.query(
          `UPDATE merch_order_logos SET order_id = $1 WHERE id = $2 AND order_id IS NULL AND claim_hash = $3 AND r2_key <> '' RETURNING id`,
          [order.id, id, sha256(claim.secret)]);
        if (!r.rowCount) { const e = new Error('uploaded logo not found, upload it again'); e.status = 400; throw e; }
      }
      await client.query(
        `INSERT INTO merch_order_events (order_id, status, note, actor_user_id) VALUES ($1, 'submitted', NULL, $2)`,
        [order.id, req.authUser?.id || null]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    const link = `${APP_URL}/merch/orders/${order.ref}?t=${secret}`;
    try {
      const t = require('../lib/emailTemplates').merchOrderReceived({
        name: v.contact.name, ref: order.ref, productLabel: v.product.label, units: quote.units,
        totalText: `NZ$${(quote.totalCents / 100).toFixed(2)}`, link,
      });
      await require('../lib/mailer').sendMail({ to: v.contact.email, subject: t.subject, text: t.text, html: t.html });
    } catch (e) {
      console.error('[merch.order] confirmation mail failed:', e.message);
    }
    audit(req, 'merch.order.submit', 'merch_order', order.id, { ref: order.ref, units: quote.units, total_cents: quote.totalCents });
    res.status(201).json({ data: { ref: order.ref, token: secret, quote } });
  }));

  // One order: the buyer's link token, the logged-in owner, or an admin.
  app.get('/api/merch/orders/:ref', asyncH(async (req, res) => {
    const ref = String(req.params.ref || '').toUpperCase();
    if (!/^BM-[A-Z0-9]{6}$/.test(ref)) return res.status(404).json({ error: 'order not found' });
    const { rows } = await pool.query('SELECT * FROM merch_orders WHERE ref = $1', [ref]);
    const o = rows[0];
    const token = String(req.query.t || '');
    const ok = o && ((token && crypto.timingSafeEqual(Buffer.from(sha256(token)), Buffer.from(o.access_hash)))
      || (req.authUser && (req.authUser.id === o.buyer_user_id || req.authUser.role === 'ADMIN')));
    if (!ok) return res.status(404).json({ error: 'order not found' });
    const lines = (await pool.query('SELECT size, qty FROM merch_order_lines WHERE order_id = $1 ORDER BY size', [o.id])).rows;
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ data: publicOrder(o, lines) });
  }));

  app.get('/api/my/merch-orders', asyncH(async (req, res) => {
    if (!req.authUser) return res.status(401).json({ error: 'login required' });
    const { rows } = await pool.query(
      `SELECT o.ref, o.status, o.product_id, o.color, o.total_cents, o.created_at,
         (SELECT COALESCE(SUM(qty), 0) FROM merch_order_lines l WHERE l.order_id = o.id)::INT AS units
       FROM merch_orders o WHERE o.buyer_user_id = $1 ORDER BY o.created_at DESC LIMIT 50`,
      [req.authUser.id]);
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ data: rows });
  }));
};

module.exports.parseOrderInput = parseOrderInput;
