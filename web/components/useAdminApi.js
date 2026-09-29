'use client';
import { API } from '../lib/api';

// Shared authed fetch for admin pages: one error shape, session cookie
// first-party via the /api proxy. Replaces the copy-pasted call() helpers.
export function useAdminApi() {
  return async (path, opts = {}) => {
    const res = await fetch(`${API}${path}`, {
      credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts,
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
    return j.data;
  };
}
