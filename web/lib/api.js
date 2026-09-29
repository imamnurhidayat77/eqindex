// Browser uses the same-origin proxy (/api/* -> Cloud Run via rewrites) so
// session cookies are first-party and can't be blocked. Server components
// call the API directly (Node has no cookie jar issues).
export const API = typeof window === 'undefined'
  ? (process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001')
  : '/api';
// NOTE: no shared demo user — user-scoped reads use the session (getPrivateJSON
// server-side, first-party cookies client-side). Never reintroduce ?user_id=.

export async function getJSON(path, { revalidate = 30 } = {}) {
  const res = await fetch(`${API}${path}`, { next: { revalidate } });
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json();
}

// Session-scoped server reads: NEVER cached (Next fetch cache is per-URL,
// so a shared entry would leak one user's data to another).
export async function getPrivateJSON(path, token) {
  const res = await fetch(`${API}${path}`, {
    cache: 'no-store',
    headers: token ? { cookie: `eq_session=${token}` } : {},
  });
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json();
}
