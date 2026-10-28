// Browser uses the same-origin proxy (/api/* -> Cloud Run).
// Server components call the API directly (no cookie jar issues).
export const API = typeof window === 'undefined'
  ? (process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001')
  : '/api';

// Public site origin for canonical URLs, sitemap and social cards.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://bossmedia.nz').replace(/\/$/, '');

export async function getJSON(path) {
  const res = await fetch(`${API}${path}`, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json();
}

// Tiny client-side cache for session reads (My media / account triple
// fetch). 30s TTL, credentials included. Mutations (buy/unlock) navigate
// away, so mild staleness here is harmless.
const memCache = new Map();
export async function cachedJson(path, ttl = 30000) {
  const now = Date.now();
  const hit = memCache.get(path);
  if (hit && now - hit.at < ttl) return hit.data;
  if (hit?.pending) return hit.pending;
  const pending = fetch(`${API}${path}`, { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      memCache.set(path, { at: Date.now(), data: j });
      return j;
    })
    .catch(() => null)
    .finally(() => {
      const cur = memCache.get(path);
      if (cur?.pending) memCache.set(path, { at: cur.at || 0, data: cur.data });
    });
  memCache.set(path, { at: 0, data: null, pending });
  return pending;
}
