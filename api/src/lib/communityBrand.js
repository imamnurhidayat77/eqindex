// Full-resolution Boss Media branding for community moment downloads (the
// sponsor repost licence). Previews keep their tiled mark (media.js,
// reelFinalize.js). This is the clean corner wordmark a sponsor reposts.
// Branded files are cached in storage next to nothing else: one per media.
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const sharp = require('sharp');
const mediaStore = require('./mediaStore');
const { probeDims, renderBranded } = require('./reelProcess');

const BRAND_TEXT = '© Boss Media';
const MARK_SHARE = 0.035; // text height as a share of the short side
const MARK_MIN_PX = 18;
const CHAR_WIDTH_EM = 0.62; // generous bold sans-serif average
const PHOTO_QUALITY = 92;
const BRANDED_NAMESPACE = 'community';

const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Corner badge sized from the short side only, so a rotated phone video
// (coded 1920x1080, shown 1080x1920) gets the same badge either way.
function brandBadge(shortSide, text = BRAND_TEXT) {
  const size = Math.max(MARK_MIN_PX, Math.round(shortSide * MARK_SHARE));
  const stroke = Math.max(1, Math.round(size / 14));
  const width = Math.ceil(text.length * size * CHAR_WIDTH_EM) + stroke * 2;
  const height = Math.ceil(size * 1.3);
  const svg = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
    `<text x="${width - stroke}" y="${size}" text-anchor="end" font-family="sans-serif" ` +
    `font-size="${size}" font-weight="bold" fill="white" fill-opacity="0.92" ` +
    `stroke="black" stroke-opacity="0.35" stroke-width="${stroke}" paint-order="stroke">` +
    `${escXml(text)}</text></svg>`
  );
  return { svg, width, height, pad: size };
}

async function brandPhotoBuffer(buf) {
  const { data, info } = await sharp(buf).rotate().toBuffer({ resolveWithObject: true });
  const badge = brandBadge(Math.min(info.width, info.height));
  return sharp(data)
    .composite([{
      input: badge.svg,
      left: Math.max(0, info.width - badge.width - badge.pad),
      top: Math.max(0, info.height - badge.height - badge.pad),
    }])
    .jpeg({ quality: PHOTO_QUALITY })
    .toBuffer();
}

function brandedKey(m) {
  const ext = m.kind === 'reel' ? 'mp4' : 'jpg';
  return mediaStore.keyFor('branded', m.event_id, m.id, ext, BRANDED_NAMESPACE);
}

async function readAll(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}

async function renderBrandedReel(m, key) {
  const dims = await probeDims((await mediaStore.getStream(m.storage_key)).stream);
  const badge = brandBadge(Math.min(dims.width, dims.height));
  const badgePath = path.join(os.tmpdir(), `eqindex-badge-${m.id}.png`);
  let outPath = null;
  try {
    await fs.promises.writeFile(badgePath, await sharp(badge.svg).png().toBuffer());
    outPath = await renderBranded((await mediaStore.getStream(m.storage_key)).stream, badgePath, badge.pad);
    // Streamed upload: a full-res reel must not sit whole in Node memory.
    await mediaStore.putBuffer(key, fs.createReadStream(outPath), 'video/mp4');
  } finally {
    await fs.promises.unlink(badgePath).catch(() => {});
    if (outPath) await fs.promises.unlink(outPath).catch(() => {});
  }
}

const reelJobs = new Map(); // media id -> running render (one per process)

function startReelRender(m, key) {
  if (!reelJobs.has(m.id)) {
    const job = renderBrandedReel(m, key)
      .catch((e) => console.error('[community-brand] reel render failed:', m.id, e.message))
      .finally(() => reelJobs.delete(m.id));
    reelJobs.set(m.id, job);
  }
  return reelJobs.get(m.id);
}

// Returns the storage key of the branded full-res file, or null while a reel
// is still rendering (the caller asks the buyer to retry shortly).
async function ensureBrandedFile(m) {
  const key = brandedKey(m);
  if (await mediaStore.headKey(key)) return key;
  if (m.kind === 'reel') { startReelRender(m, key); return null; }
  const buf = await readAll((await mediaStore.getStream(m.storage_key)).stream);
  await mediaStore.putBuffer(key, await brandPhotoBuffer(buf), 'image/jpeg');
  return key;
}

// Warm the cache right after publish so a sponsor's first reel download is
// instant. Photos render fast enough on demand, so only reels warm up.
function prewarmBrandedFile(m) {
  if (m.kind !== 'reel' || !m.storage_key) return;
  const key = brandedKey(m);
  mediaStore.headKey(key)
    .then((found) => { if (!found) startReelRender(m, key); })
    .catch((e) => console.error('[community-brand] prewarm failed:', m.id, e.message));
}

module.exports = { brandBadge, brandPhotoBuffer, brandedKey, ensureBrandedFile, prewarmBrandedFile, BRAND_TEXT };
