// Studio data layer: session-auth admin endpoints via same-origin proxy.
import { useEffect, useState } from 'react';
import { API } from './api';

export async function studioFetch(path, { method = 'GET', body, form } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    credentials: 'include',
    ...(form ? { body: form } : body !== undefined
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`);
  return j;
}

export const studio = {
  get: (p) => studioFetch(p).then((j) => j.data),
  post: (p, body) => studioFetch(p, { method: 'POST', body }),
  patch: (p, body) => studioFetch(p, { method: 'PATCH', body }),
  del: (p) => studioFetch(p, { method: 'DELETE' }),
  upload: (form) => studioFetch('/admin/media/upload', { method: 'POST', form }),
};

export function useStudioUser() {
  const [user, setUser] = useState(null);
  const [state, setState] = useState('loading'); // loading | ok | login | denied
  useEffect(() => {
    fetch(`${API}/auth/me`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const u = j?.data;
        if (!u) return setState('login');
        setUser(u);
        setState(u.role === 'PHOTOGRAPHER' || u.role === 'ADMIN' ? 'ok' : 'denied');
      })
      .catch(() => setState('login'));
  }, []);
  return { user, state };
}

export const nzdc = (cents) =>
  `NZ$${(Number(cents || 0) / 100).toLocaleString('en-NZ', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const dayOf = (iso) => (iso || '').slice(0, 10);
