// Object-storage helper for the photo platform (docs/PHOTO_PLATFORM_PLAN.md §4).
// Backend: Cloudflare R2 via the S3-compatible API. Required env:
//   R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
// Optional: R2_PUBLIC_BASE (public CDN base for previews/thumbs).
// Layout: {originals,previews,thumbs}/{event_id}/{media_id}.{ext}
// Optional: R2_PRIVATE_BUCKET for everything that is not a preview/thumb.
// Throws a clear error when unconfigured (P0 wires config only; P1 uploads).
//
// SECURITY: R2 public access (r2.dev or a public custom domain) opens the
// WHOLE bucket, and original keys are guessable from preview keys. So only
// previews/thumbs may live in the public bucket: originals, baked logo
// variants, branded files and merch artwork go to R2_PRIVATE_BUCKET.
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

// Key layouts: <kind>/<event>/<file> or <namespace>/<kind>/<event>/<file>.
const PUBLIC_KINDS = new Set(['previews', 'thumbs']);
function isPublicKey(key) {
  const parts = String(key || '').split('/');
  if (parts.length === 3) return PUBLIC_KINDS.has(parts[0]);
  if (parts.length === 4) return PUBLIC_KINDS.has(parts[1]);
  return false;
}

let warnedNoPrivate = false;
function bucketFor(key) {
  const { R2_BUCKET } = cfg();
  if (isPublicKey(key)) return R2_BUCKET;
  const priv = process.env.R2_PRIVATE_BUCKET;
  if (!priv) {
    // Fallback keeps the app working until the private bucket exists, but
    // originals stay exposed: shout once.
    if (!warnedNoPrivate) { warnedNoPrivate = true; console.error('[media] R2_PRIVATE_BUCKET unset: private files share the public bucket'); }
    return R2_BUCKET;
  }
  return priv;
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
  await s3().send(new PutObjectCommand({ Bucket: bucketFor(key), Key: key, Body: body, ContentType: contentType }));
  return key;
}

// Short-lived download URL for paid originals (15 min per plan §3.5).
// Pass downloadName to force a file download (Content-Disposition:
// attachment) instead of inline display — the browser then downloads
// without navigating away from the page. Previews/thumbs omit it.
async function signedDownloadUrl(key, seconds = 900, downloadName = null) {
  const params = { Bucket: bucketFor(key), Key: key };
  if (downloadName) {
    const safe = String(downloadName).replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120);
    params.ResponseContentDisposition = `attachment; filename="${safe}"`;
  }
  return getSignedUrl(s3(), new GetObjectCommand(params), { expiresIn: seconds });
}

// Direct browser-to-R2 upload (P2B): videos bypass the API/proxy entirely
// (Vercel proxy ~30s limit can't carry 50–200MB). The browser PUTs bytes to
// this URL with Content-Type set, then calls POST /admin/media/:id/finalize.
// DEPLOY: the R2 bucket needs a CORS rule allowing PUT from the web origin.
async function presignedPutUrl(key, contentType, seconds = 900) {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucketFor(key), Key: key, ContentType: contentType }),
    { expiresIn: seconds }
  );
}

// Stream an object back (finalize reads the original without buffering it;
// R2 egress is $0 so API-side processing costs nothing extra).
async function getStream(key) {
  const out = await s3().send(new GetObjectCommand({ Bucket: bucketFor(key), Key: key }));
  if (!out.Body) throw new Error(`storage object missing: ${key}`);
  return { stream: out.Body, size: Number(out.ContentLength) || null, contentType: out.ContentType || null };
}

async function headKey(key) {
  try {
    const out = await s3().send(new HeadObjectCommand({ Bucket: bucketFor(key), Key: key }));
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
  const byBucket = new Map();
  for (const key of list) {
    const b = bucketFor(key);
    byBucket.set(b, [...(byBucket.get(b) || []), key]);
  }
  let deleted = 0;
  for (const [Bucket, keys] of byBucket) {
    const out = await s3().send(new DeleteObjectsCommand({
      Bucket, Delete: { Objects: keys.map((Key) => ({ Key })) },
    }));
    deleted += (out.Deleted || []).length;
  }
  return deleted;
}

module.exports = { keyFor, isPublicKey, bucketFor, putBuffer, signedDownloadUrl, presignedPutUrl, getStream, headKey, publicUrl, publicUrlOrPassthrough, deleteKeys };
