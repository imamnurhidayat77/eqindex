'use client';
import { useEffect, useState } from 'react';
import { API } from './api';

// One session read shared by the header and every page: concurrent callers
// reuse the same request, and the last answer seeds the next mount so a
// client-side navigation never flashes the logged-out header.
let lastMe; // undefined = never checked, null = logged out
let inflight = null;
const HINT_KEY = 'bossmedia:authed';

export function peekMe() { return lastMe; }

export function fetchMe() {
  if (inflight) return inflight;
  inflight = fetch(`${API}/auth/me`, { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { lastMe = j?.data || null; return lastMe; })
    .catch(() => lastMe ?? null)
    .finally(() => { inflight = null; });
  inflight.then((me) => {
    try { if (me) localStorage.setItem(HINT_KEY, '1'); else localStorage.removeItem(HINT_KEY); } catch { /* storage blocked */ }
  });
  return inflight;
}

// Whether this browser was signed in last time (decides the first paint
// before the session check answers).
export function wasSignedIn() {
  try { return localStorage.getItem(HINT_KEY) === '1'; } catch { return false; }
}

// Call after login/logout so the next read is fresh.
export function resetMe(me) { lastMe = me; }

export function useAuthed() {
  const [user, setUser] = useState(() => lastMe ?? null);
  const [loading, setLoading] = useState(() => lastMe === undefined);
  useEffect(() => {
    let live = true;
    fetchMe().then((me) => { if (live) { setUser(me); setLoading(false); } });
    return () => { live = false; };
  }, []);
  return { user, loading };
}
