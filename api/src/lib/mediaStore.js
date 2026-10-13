// Object-storage helper for the photo platform (docs/PHOTO_PLATFORM_PLAN.md §4).
// Backend: Cloudflare R2 via the S3-compatible API. Required env:
//   R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
// Optional: R2_PUBLIC_BASE (public CDN base for previews/thumbs).
// Layout: {originals,previews,thumbs}/{event_id}/{media_id}.{ext}
// Throws a clear error when unconfigured (P0 wires config only; P1 uploads).
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

let client = null;
function cfg() {
  const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    throw new Error('media storage unconfigured (need R2_ENDPOINT/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET)');
  }
  return { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET };
}

function s3() {
  if (!client) {
    const c = cfg();
    client = new S3Client({
      region: 'auto',
      endpoint: c.R2_ENDPOINT,
      credentials: { accessKeyId: c.R2_ACCESS_KEY_ID, secretAccessKey: c.R2_SECRET_ACCESS_KEY },
    });
  }
  return client;
}

const keyFor = (kind, eventId, mediaId, ext) =>
  `${kind}/${eventId || 'unsorted'}/${mediaId}.${(ext || 'jpg').replace(/^\./, '')}`;

async function putBuffer(key, body, contentType) {
  const { R2_BUCKET } = cfg();
  await s3().send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: contentType }));
  return key;
}

// Short-lived download URL for paid originals (15 min per plan §3.5).
async function signedDownloadUrl(key, seconds = 900) {
  const { R2_BUCKET } = cfg();
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }), { expiresIn: seconds });
}

// Public CDN URL for previews/thumbs (no signature).
function publicUrl(key) {
  const base = (process.env.R2_PUBLIC_BASE || '').replace(/\/$/, '');
  if (!base) throw new Error('R2_PUBLIC_BASE unset — cannot build public media URL');
  return `${base}/${key}`;
}

// Best-effort delete (DB row is the source of truth; missing keys are fine).
async function deleteKeys(keys) {
  const list = (keys || []).filter(Boolean);
  if (!list.length) return 0;
  const { R2_BUCKET } = cfg();
  const out = await s3().send(new DeleteObjectsCommand({
    Bucket: R2_BUCKET, Delete: { Objects: list.map((Key) => ({ Key })) },
  }));
  return (out.Deleted || []).length;
}

module.exports = { keyFor, putBuffer, signedDownloadUrl, publicUrl, deleteKeys };
