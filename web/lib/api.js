// Browser uses the same-origin proxy (/api/* -> Cloud Run via rewrites) so
// session cookies are first-party and can't be blocked. Server components
// call the API directly (Node has no cookie jar issues).
export const API = typeof window === 'undefined'
  ? (process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001')
  : '/api';
export const DEMO_USER = process.env.NEXT_PUBLIC_DEMO_USER_ID || '';

export async function getJSON(path) {
  const res = await fetch(`${API}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json();
}
