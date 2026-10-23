// Object-storage helper for the photo platform (docs/PHOTO_PLATFORM_PLAN.md §4).
// Backend: Cloudflare R2 via the S3-compatible API. Required env:
//   R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
// Optional: R2_PUBLIC_BASE (public CDN base for previews/thumbs).
// Layout: {originals,previews,thumbs}/{event_id}/{media_id}.{ext}
// Throws a clear error when unconfigured (P0 wires config only; P1 uploads).
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectsCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
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

// Namespace for new uploads: one prefix per photographer/studio so a shared
// bucket stays attributable (Boss Media split, MASTER_PLAN §10). Old keys
// without a prefix keep working — keys are stored per row, never recomputed.
const slugify = (s) => String(s || 'studio').toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'studio';

const keyFor = (kind, eventId, mediaId, ext, namespace) => {
  const base = `${kind}/${eventId || 'unsorted'}/${mediaId}.${(ext || 'jpg').replace(/^\./, '')}`;
  return namespace ? `${slugify(namespace)}/${base}` : base;
};

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

// Direct browser-to-R2 upload (P2B): videos bypass the API/proxy entirely
// (Vercel proxy ~30s limit can't carry 50–200MB). The browser PUTs bytes to
// this URL with Content-Type set, then calls POST /admin/media/:id/finalize.
// DEPLOY: the R2 bucket needs a CORS rule allowing PUT from the web origin.
async function presignedPutUrl(key, contentType, seconds = 900) {
  const { R2_BUCKET } = cfg();
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: seconds }
  );
}

// Stream an object back (finalize reads the original without buffering it;
// R2 egress is $0 so API-side processing costs nothing extra).
async function getStream(key) {
  const { R2_BUCKET } = cfg();
  const out = await s3().send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  if (!out.Body) throw new Error(`storage object missing: ${key}`);
  return { stream: out.Body, size: Number(out.ContentLength) || null, contentType: out.ContentType || null };
}

async function headKey(key) {
  const { R2_BUCKET } = cfg();
  try {
    const out = await s3().send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return { size: Number(out.ContentLength) || 0, contentType: out.ContentType || '' };
  } catch {
    return null;
  }
}

// Public CDN URL for previews/thumbs (no signature).
function publicUrl(key) {
  const base = (process.env.R2_PUBLIC_BASE || '').replace(/\/$/, '');
  if (!base) throw new Error('R2_PUBLIC_BASE unset — cannot build public media URL');
  return `${base}/${key}`;
}

// Same as publicUrl, but mock/seed rows may store a full http(s) URL
// directly in the key columns — pass those through untouched.
function publicUrlOrPassthrough(key) {
  if (!key) return null;
  if (/^https?:\/\//i.test(key)) return key;
  return publicUrl(key);
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

module.exports = { keyFor, putBuffer, signedDownloadUrl, presignedPutUrl, getStream, headKey, publicUrl, publicUrlOrPassthrough, deleteKeys };
