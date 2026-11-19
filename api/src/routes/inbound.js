const crypto = require('crypto');
const pool = require('../db');
const { asyncH } = require('../lib/async');
const { EMAIL_RE } = require('../lib/auth');
const { throttled } = require('../lib/ratelimit');
const { audit } = require('../lib/audit');
const { sendMail } = require('../lib/mailer');
const { APP_URL } = require('../config');
const mediaStore = require('../lib/mediaStore');
const finalizeReel = require('../lib/reelFinalize');
const sharp = require('sharp');
const multer = require('multer');
const { UPLOAD_EMAIL, UPLOAD_MAX_FILES, UPLOAD_MAX_BYTES, INBOUND_WEBHOOK_SECRET } = require('../config');

// Inbound email intake for community moments (P1: ingest only).
// Provider posts SendGrid Inbound Parse shape (multipart + attachmentN files);
// an SES adapter only needs to reshape its JSON into the same fields
// (see normalizeParseBody) — the pipeline below stays untouched.
//
// Flow per email: secret-check → 202-fast validate → intake row (idempotent
// on provider_msg_id) → event-code match → per-file process (photos to R2 +
// draft media rows, everything else rejected with a kind reply) → reply mail.
// Verification gating (first-time senders) lands in P2; until then every
// accepted draft waits in the review queue and nothing auto-publishes.

const inboundUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
});

const PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const HEIC_MIMES = ['image/heic', 'image/heif'];
const REEL_MIMES = ['video/mp4', 'video/quicktime', 'video/webm'];

// First meaningful token of the subject is the event code (TAKAPOTO26).
// Skips reply prefixes so "Re: TAKAPOTO26 ..." still matches.
function parseEventCode(subject) {
  // Codes always carry digits (TAKAPOTO26) — without that rule an ordinary
  // word like "photos" would match and route mail to the wrong event.
  for (const raw of String(subject || '').split(/\s+/)) {
    const t = raw.replace(/[^a-z0-9]+/gi, '').toUpperCase();
    if (/^(RE|FWD?|AW|SV|VS)$/.test(t)) continue;
    if (/^[A-Z0-9]{4,12}$/.test(t) && /[0-9]/.test(t)) return t;
    if (t) return null;
  }
  return null;
}

function parseAddr(v) {
  const m = String(v || '').match(/<([^<>@\s]+@[^<>@\s]+)>/);
  const addr = (m ? m[1] : String(v || '').trim()).toLowerCase();
  return EMAIL_RE.test(addr) ? addr : null;
}

function parseMessageId(headers, fallbackParts) {
  const m = String(headers || '').match(/^message-id:\s*(.+)$/gim);
  if (m?.length) return m[0].split(':').slice(1).join(':').trim().slice(0, 200);
  return `hash-${crypto.createHash('sha256').update(fallbackParts.join('|')).digest('hex').slice(0, 32)}`;
}

function normalizeParseBody(body) {
  // SendGrid shape in, normalized shape out. SES adapter: build this same
  // object from the SES receipt event instead of touching the pipeline.
  let envelope = {};
  try { envelope = JSON.parse(body.envelope || '{}'); } catch { /* untrusted shape */ }
  const toList = (Array.isArray(envelope.to) ? envelope.to : [body.to]).filter(Boolean);
  return {
    toList,
    from: body.from || envelope.from || '',
    subject: body.subject || '',
    headers: body.headers || '',
    spamScore: Number(body.spam_score ?? NaN),
  };
}

async function upcomingCodedEvents() {
  const { rows } = await pool.query(
    `SELECT name, upload_code FROM events
      WHERE upload_code IS NOT NULL AND (date_end IS NULL OR date_end >= CURRENT_DATE)
      ORDER BY date_start DESC NULLS LAST LIMIT 3`
  );
  return rows;
}

// ---- QR web upload helpers (pure where possible — see web-upload.test.mjs)
const UUID_RE = require('../lib/resolve').UUID_RE;

const webUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
});

const WEB_REEL_MIMES = ['video/mp4', 'video/quicktime', 'video/webm'];
const WEB_MAX_VIDEO_BYTES = 200 * 1024 * 1024;

// Multipart/JSON bodies arrive as strings — normalize once, validate once.
function cleanWebContact(b) {
  const email = String(b?.email || '').trim().toLowerCase();
  const phone = String(b?.phone || '').replace(/[^+\d]/g, '').slice(0, 20) || null;
  const rider = String(b?.rider_name || '').trim().slice(0, 120) || null;
  const horse = String(b?.horse_name || '').trim().slice(0, 120) || null;
  const consent = b?.consent === true || b?.consent === 'true';
  return { email, phone, rider, horse, consent };
}

function webContactError({ email, consent }) {
  if (!EMAIL_RE.test(email)) return 'enter a valid email so we can credit you';
  if (consent !== true) return 'please tick the permission box — without it we cannot publish your content';
  return null;
}

// Upload codes are short, always carry digits (TAKAPO26), and match the
// email door's rule so one code works for both doors.
function normalizeUploadCode(code) {
  const c = String(code || '').trim().toUpperCase();
  return /^(?=.*[0-9])[A-Z0-9]{4,12}$/.test(c) ? c : null;
}

async function findCodedEvent(code) {
  const c = normalizeUploadCode(code);
  if (!c) return null;
  const { rows } = await pool.query(
    `SELECT id, slug, name, venue, region, date_start, date_end
       FROM events WHERE UPPER(upload_code) = $1 LIMIT 1`,
    [c]
  );
  return rows[0] || null;
}

async function communityPhotographer() {
  const { rows } = await pool.query(
    `SELECT * FROM photographers WHERE name = 'Community' AND is_active LIMIT 1`);
  if (!rows.length) throw new Error('community photographer missing — run migration 100');
  return rows[0];
}

// Same photo pipeline as the email door: clean preview, no proof tile
// (community moments are free, never for sale). Returns accepted/rejected.
async function storeWebPhotos(files, photographer, eventId, msgId) {
  const { fileTypeFromBuffer } = await import('file-type');
  const accepted = [];
  const rejected = [];
  for (const f of files) {
    const detected = await fileTypeFromBuffer(f.buffer).catch(() => null);
    const real = (detected?.mime || f.mimetype || '').toLowerCase();
    const ext = ((detected?.ext || String(f.originalname || '').split('.').pop() || 'jpg')
      .toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 8) || 'jpg');
    if (['heic', 'heif'].includes(ext)) {
      rejected.push({ file: f.originalname, reason: 'heic — resend as JPEG or PNG' });
      continue;
    }
    if (!PHOTO_MIMES.includes(real) || !real.startsWith('image/')) {
      rejected.push({ file: f.originalname, reason: 'not a usable photo' });
      continue;
    }
    const { rows } = await pool.query(
      `INSERT INTO media (photographer_id, event_id, kind, status, source, source_ref)
       VALUES ($1, $2, 'photo', 'draft', 'web', $3) RETURNING id`,
      [photographer.id, eventId, msgId]
    );
    const id = rows[0].id;
    try {
      const origKey = mediaStore.keyFor('originals', eventId, id, ext, photographer.name);
      await mediaStore.putBuffer(origKey, f.buffer, detected.mime);
      const meta = await sharp(f.buffer).metadata();
      const thumb = await sharp(f.buffer).rotate().resize({ width: 480, withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
      const preview = await sharp(f.buffer).rotate().resize({ width: 1024, withoutEnlargement: true })
        .jpeg({ quality: 72 }).toBuffer();
      const thumbKey = mediaStore.keyFor('thumbs', eventId, id, 'jpg', photographer.name);
      const previewKey = mediaStore.keyFor('previews', eventId, id, 'jpg', photographer.name);
      await mediaStore.putBuffer(thumbKey, thumb, 'image/jpeg');
      await mediaStore.putBuffer(previewKey, preview, 'image/jpeg');
      await pool.query(
        `UPDATE media SET storage_key = $2, thumb_key = $3, preview_key = $4, width = $5, height = $6 WHERE id = $1`,
        [id, origKey, thumbKey, previewKey, meta.width || null, meta.height || null]
      );
      accepted.push({ file: f.originalname, id });
    } catch (e) {
      await pool.query(`UPDATE media SET status = 'archived' WHERE id = $1`, [id]);
      rejected.push({ file: f.originalname, reason: 'processing-failed' });
    }
  }
  return { accepted, rejected };
}

async function ensureWebSender(email, phone) {
  await pool.query(`INSERT INTO upload_senders (email) VALUES ($1) ON CONFLICT (email) DO NOTHING`, [email]);
  if (phone) {
    await pool.query(`UPDATE upload_senders SET phone = COALESCE($2, phone) WHERE email = $1`, [email, phone]);
  }
  const { rows } = await pool.query(`SELECT verified_at FROM upload_senders WHERE email = $1`, [email]);
  return !!rows[0]?.verified_at;
}

async function issueWebVerifyMail(email, eventName, count, intakeId) {
  await pool.query(`DELETE FROM upload_verify_tokens WHERE sender_email = $1 AND used_at IS NULL`, [email]);
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  await pool.query(
    `INSERT INTO upload_verify_tokens (token_hash, sender_email, intake_id, expires_at)
      VALUES ($1, $2, $3, NOW() + INTERVAL '48 hours')`,
    [hash, email, intakeId]
  );
  const noun = count === 1 ? 'video' : `${count} photos`;
  {
    const t = require('../lib/emailTemplates').verifySender({
      noun, eventName, link: `${APP_URL}/upload/verify?token=${raw}`, askClaims: false,
    });
    await reply(email, t.subject, t.text);
  }
}

async function reply(to, subject, text) {
  // Best-effort by design: mailer throws when Resend is unset (dev), and a
  // failed reply must never fail the intake. Auto-replies also skip
  // machine senders to avoid backscatter loops.
  if (/mailer-daemon|postmaster|no-?reply/i.test(to)) return;
  try {
    await sendMail({ to, subject, text });
  } catch (e) {
    console.error('[inbound] reply failed:', e.message);
  }
}

module.exports = function mountInboundRoutes(app) {
  app.post('/api/inbound/email', inboundUpload.any(), asyncH(async (req, res) => {
    if (!UPLOAD_EMAIL || !INBOUND_WEBHOOK_SECRET) {
      return res.status(503).json({ error: 'inbound email not configured' });
    }
    const key = String(req.query.key || '');
    const ok = key.length === INBOUND_WEBHOOK_SECRET.length
      && crypto.timingSafeEqual(Buffer.from(key), Buffer.from(INBOUND_WEBHOOK_SECRET));
    if (!ok) return res.status(403).json({ error: 'bad webhook key' });
    if (await throttled(pool, req.ip || 'x', 'inbound-email', 60, 10 * 60e3)) {
      return res.status(429).json({ error: 'too many requests, try again later' });
    }

    const norm = normalizeParseBody(req.body || {});
    const toHit = norm.toList.some((t) => String(t).toLowerCase().trim() === UPLOAD_EMAIL);
    // Wrong address: 200 + ignore (never reveal which addresses are live).
    if (!toHit) return res.status(200).json({ data: { ignored: true } });
    const sender = parseAddr(norm.from);
    if (!sender) return res.status(200).json({ data: { ignored: true } });

    // SpamAssassin-style score from the parse provider (only present when the
    // provider's spam check is on). >= 5 is firmly spam: drop silently — a
    // reply would confirm the address to forged senders (backscatter).
    if (Number.isFinite(norm.spamScore) && norm.spamScore >= 5) {
      await pool.query(
        `INSERT INTO upload_intakes (provider_msg_id, sender_email, status, error)
         VALUES ($1, $2, 'rejected', 'spam-suspect') ON CONFLICT DO NOTHING`,
        [parseMessageId(norm.headers, [sender, norm.subject, 'spam']), sender]
      );
      audit({ body: { user_id: `inbound:${sender}` }, query: {} }, 'inbound.spam', 'upload_intakes', null,
        { score: norm.spamScore });
      return res.status(200).json({ data: { rejected: 'spam-suspect' } });
    }

    const msgId = parseMessageId(norm.headers, [sender, norm.subject, JSON.stringify(req.body['attachment-info'] || '')]);
    let intakeId = null;
    try {
      const { rows } = await pool.query(
        `INSERT INTO upload_intakes (provider_msg_id, sender_email)
         VALUES ($1, $2) RETURNING id`,
        [msgId, sender]
      );
      intakeId = rows[0].id;
    } catch (e) {
      if (e.code === '23505') return res.status(200).json({ data: { deduped: true } });
      throw e;
    }
    const failIntake = async (status, error) => {
      await pool.query(`UPDATE upload_intakes SET status = $2, error = $3 WHERE id = $1`, [intakeId, status, error]);
    };

    // Per-sender flood guard (in addition to the IP throttle above).
    const { rows: recent } = await pool.query(
      `SELECT COUNT(*)::INT AS n FROM upload_intakes
        WHERE sender_email = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [sender]
    );
    if (recent[0].n > 10) {
      await failIntake('rejected', 'rate limited: more than 10 emails/hour');
      return res.status(200).json({ data: { intake_id: intakeId, rejected: 'rate-limited' } });
    }

    // Event code from the subject's first meaningful token.
    const code = parseEventCode(norm.subject);
    let event = null;
    if (code) {
      const { rows } = await pool.query(
        `SELECT id, slug, name FROM events WHERE UPPER(upload_code) = $1 LIMIT 1`, [code]
      );
      event = rows[0] || null;
    }
    await pool.query(`UPDATE upload_intakes SET event_code = $2, event_id = $3 WHERE id = $1`,
      [intakeId, code, event?.id || null]);
    if (!event) {
      const upcoming = await upcomingCodedEvents();
      const hint = upcoming.length
        ? upcoming.map((e) => `${e.upload_code} — ${e.name}`).join('\n')
        : 'No events are accepting email uploads right now.';
      await failIntake('rejected', code ? `unknown event code: ${code}` : 'no event code in subject');
      {
        const t = require('../lib/emailTemplates').unknownEvent({ uploadEmail: UPLOAD_EMAIL, hint });
        await reply(sender, t.subject, t.text);
      }
      return res.status(200).json({ data: { intake_id: intakeId, rejected: 'unknown-event' } });
    }

    const files = (req.files || []).filter((f) => /^attachment\d*$/i.test(f.fieldname) || f.fieldname === 'attachment');
    if (!files.length) {
      await failIntake('rejected', 'no photo attachments');
      {
        const t = require('../lib/emailTemplates').noAttachments({ uploadEmail: UPLOAD_EMAIL, eventName: event.name, maxFiles: UPLOAD_MAX_FILES });
        await reply(sender, t.subject, t.text);
      }
      return res.status(200).json({ data: { intake_id: intakeId, rejected: 'no-attachments' } });
    }
    if (files.length > UPLOAD_MAX_FILES || files.reduce((s, f) => s + (f.size || 0), 0) > UPLOAD_MAX_BYTES) {
      await failIntake('rejected', `over limits: ${files.length} files`);
      {
        const t = require('../lib/emailTemplates').overLimits({ eventName: event.name, maxFiles: UPLOAD_MAX_FILES });
        await reply(sender, t.subject, t.text);
      }
      return res.status(200).json({ data: { intake_id: intakeId, rejected: 'over-limits' } });
    }

    const { rows: community } = await pool.query(
      `SELECT * FROM photographers WHERE name = 'Community' AND is_active LIMIT 1`);
    if (!community.length) throw new Error('community photographer missing — run migration 100');
    const photographer = community[0];
    const { fileTypeFromBuffer } = await import('file-type');
    const accepted = [];
    const rejected = [];
    for (const f of files) {
      const detected = await fileTypeFromBuffer(f.buffer).catch(() => null);
      const real = (detected?.mime || f.mimetype || '').toLowerCase();
      const ext = ((detected?.ext || String(f.originalname || '').split('.').pop() || 'jpg')
        .toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 8) || 'jpg');
      if (REEL_MIMES.includes(real) || /\.(mp4|mov|webm)$/i.test(f.originalname || '')) {
        rejected.push({ file: f.originalname, reason: 'video-by-email' });
        continue;
      }
      if (HEIC_MIMES.includes(real) || ext === 'heic' || ext === 'heif') {
        // sharp (libvips) cannot decode HEIC — ask for JPEG instead of
        // silently storing bytes we can never render.
        rejected.push({ file: f.originalname, reason: 'heic' });
        continue;
      }
      if (!PHOTO_MIMES.includes(real) || !real.startsWith('image/')) {
        rejected.push({ file: f.originalname, reason: 'not-a-photo' });
        continue;
      }
      const { rows } = await pool.query(
        `INSERT INTO media (photographer_id, event_id, kind, status, source, source_ref)
         VALUES ($1, $2, 'photo', 'draft', 'email', $3) RETURNING id`,
        [photographer.id, event.id, msgId]
      );
      const id = rows[0].id;
      try {
        // Same proof pipeline as studio uploads: EXIF GPS never survives
        // into public renditions (rotate() strips it), originals stay private.
        const origKey = mediaStore.keyFor('originals', event.id, id, ext, photographer.name);
        await mediaStore.putBuffer(origKey, f.buffer, detected.mime);
        // Community moments are free and never for sale: clean preview, no
        // proof watermark (that tile exists to protect paid photos).
        const meta = await sharp(f.buffer).metadata();
        const thumb = await sharp(f.buffer).rotate().resize({ width: 480, withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
        const preview = await sharp(f.buffer).rotate().resize({ width: 1024, withoutEnlargement: true })
          .jpeg({ quality: 72 }).toBuffer();
        const thumbKey = mediaStore.keyFor('thumbs', event.id, id, 'jpg', photographer.name);
        const previewKey = mediaStore.keyFor('previews', event.id, id, 'jpg', photographer.name);
        await mediaStore.putBuffer(thumbKey, thumb, 'image/jpeg');
        await mediaStore.putBuffer(previewKey, preview, 'image/jpeg');
        await pool.query(
          `UPDATE media SET storage_key = $2, thumb_key = $3, preview_key = $4, width = $5, height = $6 WHERE id = $1`,
          [id, origKey, thumbKey, previewKey, meta.width || null, meta.height || null]
        );
        accepted.push({ file: f.originalname, id });
      } catch (e) {
        await pool.query(`UPDATE media SET status = 'archived' WHERE id = $1`, [id]);
        rejected.push({ file: f.originalname, reason: 'processing-failed' });
      }
    }

    // First-time senders verify before anything enters the review queue:
    // the click proves inbox ownership (anti-spoofing) and records consent.
    // Draft files are already stored (cheap); they stay invisible until P3,
    // which only lists in_review intakes.
    await pool.query(
      `INSERT INTO upload_senders (email) VALUES ($1) ON CONFLICT (email) DO NOTHING`, [sender]);
    const { rows: senders } = await pool.query(
      `SELECT verified_at FROM upload_senders WHERE email = $1`, [sender]);
    const verified = !!senders[0]?.verified_at;
    if (!verified) {
      await pool.query(`DELETE FROM upload_verify_tokens WHERE sender_email = $1 AND used_at IS NULL`, [sender]);
      const raw = crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(raw).digest('hex');
      await pool.query(
        `INSERT INTO upload_verify_tokens (token_hash, sender_email, intake_id, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '48 hours')`,
        [hash, sender, intakeId]
      );
      await failIntake('awaiting_verify', null);
      audit({ body: { user_id: `inbound:${sender}` }, query: {} }, 'inbound.verify.sent', 'upload_intakes', intakeId,
        { from: sender, event: event.name, accepted: accepted.length });
      {
        const t = require('../lib/emailTemplates').verifySender({
          noun: accepted.length ? `${accepted.length} photo${accepted.length > 1 ? 's' : ''}` : 'photos',
          eventName: event.name, link: `${APP_URL}/upload/verify?token=${raw}`, askClaims: true,
        });
        await reply(sender, t.subject, t.text);
      }
      return res.status(200).json({ data: { intake_id: intakeId, accepted: accepted.length, rejected: rejected.length, awaiting_verify: true } });
    }

    await failIntake('in_review', null);
    audit({ body: { user_id: `inbound:${sender}` }, query: {} }, 'inbound.email', 'upload_intakes', intakeId,
      { from: sender, event: event.name, accepted: accepted.length, rejected: rejected.length });
    {
      const t = require('../lib/emailTemplates').acceptedIntake({ count: accepted.length, eventName: event.name, skipped: rejected });
      await reply(sender, t.subject, t.text);
    }
    return res.status(200).json({ data: { intake_id: intakeId, accepted: accepted.length, rejected: rejected.length } });
  }));

  // ---- Sender verification (P2): the token IS the auth (never logged in).
  // GET shows what they're confirming; POST records consent + claims.
  async function liveToken(raw) {
    if (!raw || typeof raw !== 'string' || raw.length > 256) return null;
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    const { rows } = await pool.query(
      `SELECT t.sender_email, t.intake_id, t.expires_at, t.used_at,
              i.provider_msg_id, i.event_id, e.name AS event_name,
              (SELECT COUNT(*)::INT FROM media m
                WHERE m.source IN ('email', 'web') AND m.source_ref = i.provider_msg_id) AS photo_count
         FROM upload_verify_tokens t
         JOIN upload_intakes i ON i.id = t.intake_id
         LEFT JOIN events e ON e.id = i.event_id
        WHERE t.token_hash = $1`,
      [hash]
    );
    const row = rows[0];
    if (!row || row.used_at || new Date(row.expires_at) <= new Date()) return null;
    return row;
  }

  app.get('/api/upload/verify', asyncH(async (req, res) => {
    const row = await liveToken(req.query.token);
    if (!row) return res.status(410).json({ error: 'this link is expired, used, or invalid — send a fresh email to get a new one' });
    return res.status(200).json({ data: {
      sender: row.sender_email, event: row.event_name, photo_count: row.photo_count,
    } });
  }));

  app.post('/api/upload/verify', asyncH(async (req, res) => {
    if (await throttled(pool, req.ip || 'x', 'upload-verify', 20, 10 * 60e3)) {
      return res.status(429).json({ error: 'too many attempts, try again later' });
    }
    const row = await liveToken(req.body?.token);
    if (!row) return res.status(410).json({ error: 'this link is expired, used, or invalid — send a fresh email to get a new one' });
    const { consent, rider_name, horse_name, phone } = req.body || {};
    // Consent is the whole point of this page: without an explicit yes,
    // nothing moves. Pre-ticked boxes are not consent (UU NZ).
    if (consent !== true) {
      return res.status(400).json({ error: 'please tick the permission box — without it we cannot publish your photos' });
    }
    const cleanPhone = String(phone || '').replace(/[^+\d]/g, '').slice(0, 20) || null;
    const rider = String(rider_name || '').trim().slice(0, 120) || null;
    const horse = String(horse_name || '').trim().slice(0, 120) || null;
    await pool.query('BEGIN');
    try {
      const hash = crypto.createHash('sha256').update(String(req.body.token)).digest('hex');
      const used = await pool.query(
        `UPDATE upload_verify_tokens SET used_at = NOW()
          WHERE token_hash = $1 AND used_at IS NULL RETURNING sender_email, intake_id`,
        [hash]
      );
      if (!used.rows.length) { await pool.query('ROLLBACK'); return res.status(410).json({ error: 'this link was already used' }); }
      await pool.query(
        `UPDATE upload_senders SET verified_at = COALESCE(verified_at, NOW()), phone = COALESCE($2, phone) WHERE email = $1`,
        [row.sender_email, cleanPhone]
      );
      await pool.query(
        `UPDATE upload_intakes
            SET claimed_rider_name = $2, claimed_horse_name = $3,
                consent_at = NOW(), sender_phone = COALESCE($4, sender_phone),
                status = 'in_review', error = NULL
          WHERE id = $1 AND status = 'awaiting_verify'`,
        [row.intake_id, rider, horse, cleanPhone]
      );
      // One verification unlocks every pending intake from this sender.
      await pool.query(
        `UPDATE upload_intakes SET status = 'in_review', error = NULL
          WHERE sender_email = $1 AND status = 'awaiting_verify'`,
        [row.sender_email]
      );
      await pool.query('COMMIT');
    } catch (e) {
      await pool.query('ROLLBACK');
      throw e;
    }
    audit({ body: { user_id: `inbound:${row.sender_email}` }, query: {} }, 'inbound.verify.done', 'upload_intakes', row.intake_id,
      { rider, horse, phone: !!cleanPhone });
    return res.status(200).json({ data: { verified: true, photos_queued: row.photo_count } });
  }));

  // ---- QR web upload (venue posters): spectators scan the code, land on
  // /upload/<CODE>, and submit from their phone. Same quarantine as the
  // email door (source='web', draft until ADMIN publishes in the moments
  // queue) and the same first-time verify gate — the emailed token link is
  // the inbox-ownership proof. Photos travel multipart here; videos go
  // direct-to-R2 via web-url + web-finalize (never buffered by the API).
  app.get('/api/upload/event', asyncH(async (req, res) => {
    const event = await findCodedEvent(req.query.code);
    if (!event) return res.status(404).json({ error: 'unknown event code — check the poster and try again' });
    res.json({ data: event });
  }));

  app.post('/api/upload/web', webUpload.array('files', 10), asyncH(async (req, res) => {
    if (await throttled(pool, req.ip || 'x', 'upload-web', 20, 10 * 60e3)) {
      return res.status(429).json({ error: 'too many uploads, try again later' });
    }
    const b = req.body || {};
    const contact = cleanWebContact(b);
    const bad = webContactError(contact);
    if (bad) return res.status(400).json({ error: bad });
    const event = await findCodedEvent(b.event_code);
    if (!event) return res.status(404).json({ error: 'this QR code is for an event that is not taking uploads right now' });
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'add at least one photo (videos go through the video button)' });
    if (files.length > UPLOAD_MAX_FILES || files.reduce((s, f) => s + (f.size || 0), 0) > UPLOAD_MAX_BYTES) {
      return res.status(400).json({ error: `keep it to ${UPLOAD_MAX_FILES} photos per upload so everything arrives intact` });
    }
    const { rows: recent } = await pool.query(
      `SELECT COUNT(*)::INT AS n FROM upload_intakes
        WHERE sender_email = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [contact.email]
    );
    if (recent[0].n > 10) {
      return res.status(429).json({ error: 'too many uploads from this address — try again later' });
    }
    const photographer = await communityPhotographer();
    const msgId = `web:${crypto.randomUUID()}`;
    const { rows } = await pool.query(
      `INSERT INTO upload_intakes (provider_msg_id, sender_email, event_code, event_id,
          claimed_rider_name, claimed_horse_name, consent_at, sender_phone)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7) RETURNING id`,
      [msgId, contact.email, String(b.event_code).trim().toUpperCase(),
        event.id, contact.rider, contact.horse, contact.phone]
    );
    const intakeId = rows[0].id;
    const { accepted, rejected } = await storeWebPhotos(files, photographer, event.id, msgId);
    const verified = await ensureWebSender(contact.email, contact.phone);
    if (!verified) {
      await pool.query(`UPDATE upload_intakes SET status = 'awaiting_verify' WHERE id = $1`, [intakeId]);
      await issueWebVerifyMail(contact.email, event.name, accepted.length, intakeId);
      audit({ body: { user_id: `web:${contact.email}` }, query: {} }, 'web.verify.sent', 'upload_intakes', intakeId,
        { from: contact.email, event: event.name, accepted: accepted.length });
      return res.status(200).json({ data: { intake_id: intakeId, accepted: accepted.length, rejected, awaiting_verify: true } });
    }
    await pool.query(`UPDATE upload_intakes SET status = 'in_review', error = NULL WHERE id = $1`, [intakeId]);
    audit({ body: { user_id: `web:${contact.email}` }, query: {} }, 'web.upload', 'upload_intakes', intakeId,
      { from: contact.email, event: event.name, accepted: accepted.length, rejected: rejected.length });
    return res.status(200).json({ data: { intake_id: intakeId, accepted: accepted.length, rejected } });
  }));

  // Video door: reserves the intake + draft row and hands the browser a
  // direct-to-R2 PUT URL. The intake stays invisible ('received') until
  // web-finalize confirms the bytes landed.
  app.post('/api/upload/web-url', asyncH(async (req, res) => {
    if (await throttled(pool, req.ip || 'x', 'upload-web', 20, 10 * 60e3)) {
      return res.status(429).json({ error: 'too many uploads, try again later' });
    }
    const b = req.body || {};
    const contact = cleanWebContact(b);
    const bad = webContactError(contact);
    if (bad) return res.status(400).json({ error: bad });
    const mimetype = String(b.mimetype || '');
    if (!WEB_REEL_MIMES.includes(mimetype)) {
      return res.status(400).json({ error: 'video must be mp4, mov, or webm' });
    }
    const size = Number(b.size_bytes);
    if (!Number.isFinite(size) || size <= 0 || size > WEB_MAX_VIDEO_BYTES) {
      return res.status(400).json({ error: 'video must be 1–200MB' });
    }
    const event = await findCodedEvent(b.event_code);
    if (!event) return res.status(404).json({ error: 'this QR code is for an event that is not taking uploads right now' });
    const photographer = await communityPhotographer();
    const ext = ((String(b.filename || 'video.mp4').split('.').pop() || 'mp4')
      .toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 8)) || 'mp4';
    const msgId = `web:${crypto.randomUUID()}`;
    const { rows: intake } = await pool.query(
      `INSERT INTO upload_intakes (provider_msg_id, sender_email, event_code, event_id,
          claimed_rider_name, claimed_horse_name, consent_at, sender_phone, status)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, 'received') RETURNING id`,
      [msgId, contact.email, String(b.event_code).trim().toUpperCase(),
        event.id, contact.rider, contact.horse, contact.phone]
    );
    const { rows } = await pool.query(
      `INSERT INTO media (photographer_id, event_id, kind, status, source, source_ref)
       VALUES ($1, $2, 'reel', 'draft', 'web', $3) RETURNING id`,
      [photographer.id, event.id, msgId]
    );
    const id = rows[0].id;
    const origKey = mediaStore.keyFor('originals', event.id, id, ext, photographer.name);
    await pool.query('UPDATE media SET storage_key = $2 WHERE id = $1', [id, origKey]);
    const uploadUrl = await mediaStore.presignedPutUrl(origKey, mimetype);
    audit({ body: { user_id: `web:${contact.email}` }, query: {} }, 'web.upload-url', 'media', id,
      { mimetype, size_bytes: size, event_id: event.id });
    res.status(201).json({ data: { intake_id: intake[0].id, media_id: id, upload_url: uploadUrl, max_bytes: WEB_MAX_VIDEO_BYTES } });
  }));

  // Called by the browser after the R2 PUT finishes: confirms the bytes,
  // kicks off poster + teaser rendering, and moves the intake into the
  // review queue (or the verify gate for first-time senders).
  app.post('/api/upload/web-finalize', asyncH(async (req, res) => {
    if (await throttled(pool, req.ip || 'x', 'upload-web', 20, 10 * 60e3)) {
      return res.status(429).json({ error: 'too many uploads, try again later' });
    }
    const id = String(req.body?.media_id || '');
    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'bad media_id' });
    const { rows } = await pool.query(
      `SELECT m.*, e.name AS event_name
         FROM media m LEFT JOIN events e ON e.id = m.event_id
        WHERE m.id = $1 AND m.source = 'web' AND m.kind = 'reel' AND m.status = 'draft'`,
      [id]
    );
    const m = rows[0];
    if (!m) return res.status(404).json({ error: 'upload not found — start again from the QR code' });
    if (!m.storage_key) return res.status(409).json({ error: 'no uploaded video yet' });
    const head = await mediaStore.headKey(m.storage_key).catch(() => null);
    if (!head) return res.status(409).json({ error: 'video has not arrived yet — wait a moment and retry' });
    if (head.size > WEB_MAX_VIDEO_BYTES) return res.status(413).json({ error: 'video exceeds 200MB' });
    const { rows: intakeRows } = await pool.query(
      `SELECT id, sender_email, sender_phone, event_id FROM upload_intakes WHERE provider_msg_id = $1`, [m.source_ref]);
    const intake = intakeRows[0];
    if (!intake) return res.status(404).json({ error: 'upload not found — start again from the QR code' });
    setImmediate(() => finalizeReel(m.id).catch((e) => console.error('[web-finalize] failed:', e.message)));
    const verified = await ensureWebSender(intake.sender_email, intake.sender_phone);
    if (!verified) {
      await pool.query(`UPDATE upload_intakes SET status = 'awaiting_verify' WHERE id = $1`, [intake.id]);
      await issueWebVerifyMail(intake.sender_email, m.event_name || 'your event', 1, intake.id);
      audit({ body: { user_id: `web:${intake.sender_email}` }, query: {} }, 'web.verify.sent', 'upload_intakes', intake.id,
        { from: intake.sender_email, video: true });
      return res.status(202).json({ data: { media_id: id, processing: true, awaiting_verify: true } });
    }
    await pool.query(`UPDATE upload_intakes SET status = 'in_review', error = NULL WHERE id = $1`, [intake.id]);
    audit({ body: { user_id: `web:${intake.sender_email}` }, query: {} }, 'web.upload', 'upload_intakes', intake.id,
      { from: intake.sender_email, video: true });
    return res.status(202).json({ data: { media_id: id, processing: true } });
  }));
};

module.exports.parseEventCode = parseEventCode;
module.exports.parseMessageId = parseMessageId;
module.exports.cleanWebContact = cleanWebContact;
module.exports.webContactError = webContactError;
module.exports.normalizeUploadCode = normalizeUploadCode;
