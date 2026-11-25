// Moves every non-public object (originals, baked logo variants, branded
// files, sponsor logos, merch artwork and proofs) out of the public R2
// bucket into R2_PRIVATE_BUCKET. Previews and thumbs stay where they are.
//   node scripts/move-private-media.mjs            dry run: counts only
//   node scripts/move-private-media.mjs --copy     copy, keep the source
//   node scripts/move-private-media.mjs --delete   copy, verify, delete source
// Keys stay identical, so no DB change is needed. Safe to re-run.
import 'dotenv/config';
import {
  S3Client, ListObjectsV2Command, CopyObjectCommand, HeadObjectCommand, DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { createRequire } from 'node:module';

const { isPublicKey } = createRequire(import.meta.url)('../src/lib/mediaStore.js');
const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PRIVATE_BUCKET } = process.env;
if (!R2_ENDPOINT || !R2_BUCKET || !R2_PRIVATE_BUCKET || R2_BUCKET === R2_PRIVATE_BUCKET) {
  console.error('need R2_ENDPOINT, R2_BUCKET and a different R2_PRIVATE_BUCKET in api/.env');
  process.exit(1);
}
const mode = process.argv.includes('--delete') ? 'delete' : process.argv.includes('--copy') ? 'copy' : 'dry';
const s3 = new S3Client({
  region: 'auto', endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

const DELETE_BATCH = 500;
let token, moved = 0, kept = 0, failed = 0;
do {
  const page = await s3.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, ContinuationToken: token }));
  const done = [];
  for (const o of page.Contents || []) {
    if (isPublicKey(o.Key)) { kept++; continue; }
    if (mode === 'dry') { moved++; continue; }
    try {
      await s3.send(new CopyObjectCommand({
        Bucket: R2_PRIVATE_BUCKET, Key: o.Key, CopySource: `${R2_BUCKET}/${encodeURIComponent(o.Key).replace(/%2F/g, '/')}`,
      }));
      const head = await s3.send(new HeadObjectCommand({ Bucket: R2_PRIVATE_BUCKET, Key: o.Key }));
      if (Number(head.ContentLength) !== Number(o.Size)) throw new Error('size mismatch after copy');
      moved++;
      done.push(o.Key);
    } catch (e) {
      failed++;
      console.error('[move] failed', o.Key, e.message);
    }
  }
  if (mode === 'delete') {
    for (let i = 0; i < done.length; i += DELETE_BATCH) {
      await s3.send(new DeleteObjectsCommand({
        Bucket: R2_BUCKET, Delete: { Objects: done.slice(i, i + DELETE_BATCH).map((Key) => ({ Key })) },
      }));
    }
  }
  token = page.IsTruncated ? page.NextContinuationToken : undefined;
} while (token);

console.log(`[move] mode=${mode} private=${moved} public-kept=${kept} failed=${failed}`);
if (failed) process.exit(1);
