'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { API } from '../lib/api';

export default function WatchButton({ entityType, entityId }) {
  const router = useRouter();
  const pathname = usePathname();
  const [watchId, setWatchId] = useState(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);

  // Cek status awal: apakah entity ini sudah di-watch?
  // GET /watchlist mengembalikan entity_id (UUID) + slug, sedangkan
  // entityId prop bisa berupa slug (halaman profil route by slug).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API}/watchlist`, { credentials: 'include' });
        if (!alive) return;
        if (res.status === 401) { setChecking(false); return; }
        if (!res.ok) { setChecking(false); return; }
        const j = await res.json().catch(() => ({}));
        const hit = (j.data || []).find((w) =>
          w.entity_type === entityType &&
          (String(w.entity_id) === String(entityId) || (w.slug && String(w.slug) === String(entityId)))
        );
        if (hit) setWatchId(hit.id);
      } catch { /* belum login / offline = anggap belum watch */ }
      if (alive) setChecking(false);
    })();
    return () => { alive = false; };
  }, [entityType, entityId]);

  async function toggle() {
    if (busy || checking) return;
    setBusy(true);
    try {
      if (watchId) {
        // --- Unwatch ---
        const res = await fetch(`${API}/watchlist/${watchId}`, {
          method: 'DELETE', credentials: 'include',
        });
        if (res.status === 401) { router.push(`/login?next=${encodeURIComponent(pathname || '/watchlist')}`); return; }
        if (!res.ok) return;
        setWatchId(null);
      } else {
        // --- Watch ---
        const res = await fetch(`${API}/watchlist`, {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entity_type: entityType, entity_id: entityId }),
        });
        if (res.status === 401) { router.push(`/login?next=${encodeURIComponent(pathname || '/watchlist')}`); return; }
        if (!res.ok) return;
        const j = await res.json().catch(() => ({}));
        if (j.data?.id) setWatchId(j.data.id);
        else {
          // Fallback: ambil ulang daftar untuk dapat watchId (untuk unwatch berikutnya).
          const r2 = await fetch(`${API}/watchlist`, { credentials: 'include' }).catch(() => null);
          const j2 = r2 && r2.ok ? await r2.json().catch(() => ({})) : {};
          const hit = (j2.data || []).find((w) =>
            w.entity_type === entityType &&
            (String(w.entity_id) === String(entityId) || (w.slug && String(w.slug) === String(entityId)))
          );
          if (hit) setWatchId(hit.id);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  const watching = !!watchId;
  const label = checking ? '…' : busy ? '…' : watching ? '✓ Watching — click to unwatch' : '＋ Watch';
  return (
    <button
      onClick={toggle}
      disabled={checking || busy}
      title={watching ? 'Click to unwatch' : 'Watch this profile'}
      className={watching
        ? 'bg-goldbg border border-gold/50 text-gold rounded px-3.5 py-2 text-sm hover:brightness-110 cursor-pointer'
        : 'bg-card2 border border-line text-body rounded px-3.5 py-2 text-sm hover:text-white cursor-pointer'}
    >
      {label}
    </button>
  );
}
