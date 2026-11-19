// Shared reel finalizer: renders poster + watermarked teaser for an
// uploaded reel. Used by the studio finalize endpoint (media.js) and the
// public QR-upload finalize (inbound.js) — one pipeline, never two.
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const pool = require('../db');
const sharp = require('sharp');
const mediaStore = require('./mediaStore');
const { audit } = require('./audit');
const { probeDims, renderPreview, renderPoster } = require('./reelProcess');

const escXml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Lighter variant for REELS: same treatment as photos — a moving picture
// already carries motion branding, so identical density suffices.
function watermarkSvgLight(w, h, text) {
  const size = Math.max(22, Math.round(Math.min(w, h) / 18));
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><pattern id="wm" width="700" height="240" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)">` +
    `<text x="12" y="96" font-family="sans-serif" font-size="${size}" font-weight="bold" fill="white" fill-opacity="0.16">${escXml(text)}</text>` +
    `</pattern></defs><rect width="${w}" height="${h}" fill="url(#wm)"/></svg>`
  );
}

async function finalizeReel(mediaId) {
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
  // 2. Watermark tile PNG (lighter reel variant — fewer, fainter tiles).
  // Community moments are free and never for sale: clean teaser, no tile.
  const isCommunity = photographer.rows[0]?.name === 'Community';
  const wmPath = isCommunity ? null : path.join(os.tmpdir(), `eqindex-wm-${mediaId}.png`);
  if (wmPath) {
    const wmPng = await sharp(watermarkSvgLight(640, pvH, `© ${photographer.rows[0]?.name || 'EQINDEX'}`))
      .png().toBuffer();
    await fs.promises.writeFile(wmPath, wmPng);
  }
  try {
    // 3. Preview transcode (fresh stream; only small outputs buffered).
    const s2 = await mediaStore.getStream(m.storage_key);
    const preview = await renderPreview(s2.stream, wmPath);
    // 4. Poster is rendered from the ORIGINAL (no watermark) — it is the
    // shop window, the watermark lives on the playable teaser instead.
    const s3 = await mediaStore.getStream(m.storage_key);
    const chunks = [];
    for await (const c of s3.stream) chunks.push(c);
    const poster = await renderPoster(Buffer.concat(chunks));
    const ns = photographer.rows[0]?.name || null;
    const thumbKey = mediaStore.keyFor('thumbs', m.event_id, m.id, 'jpg', ns);
    const previewKey = mediaStore.keyFor('previews', m.event_id, m.id, 'mp4', ns);
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
    if (wmPath) await fs.promises.unlink(wmPath).catch(() => {});
  }
}

module.exports = finalizeReel;
module.exports.watermarkSvgLight = watermarkSvgLight;
