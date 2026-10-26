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
