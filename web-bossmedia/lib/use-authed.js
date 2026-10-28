'use client';
import { useEffect, useState } from 'react';
import { API } from './api';

// Single shared session check — one definition instead of a copy in
// every page. Returns { user, loading }.
export function useAuthed() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    fetch(`${API}/auth/me`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live) setUser(j?.data || null); })
      .catch(() => {})
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);
  return { user, loading };
}
