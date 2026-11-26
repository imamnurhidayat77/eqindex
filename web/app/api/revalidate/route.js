import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { PUBLIC_DATA_TAG } from '../../../lib/api';

// Called by the API after public data changes (import commit/undo, merges,
// result edits). This file route wins over the /api/* rewrite to the API.
// Not reachable without REVALIDATE_SECRET, which only the API holds.
const SECRET_HEADER = 'x-revalidate-secret';

function secretMatches(given, expected) {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req) {
  if (!secretMatches(req.headers.get(SECRET_HEADER), process.env.REVALIDATE_SECRET)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  // expire: 0 drops the entries now, so the next view refetches instead of
  // serving the pre-import copy once (Next 16; Next 14 ignores the 2nd arg).
  revalidateTag(PUBLIC_DATA_TAG, { expire: 0 });
  return Response.json({ revalidated: true });
}
