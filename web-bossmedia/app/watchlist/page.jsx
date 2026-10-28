'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API } from '../../lib/api';
import { useAuthed } from '../../lib/use-authed';
import { useDocumentTitle } from '../../lib/use-document-title';
import { useToast } from '../../components/Toaster';
import PageShell from '../../components/PageShell';

// Who you follow: riders and horses. New published photos of them trigger
// a notification (see the publish hook) — the photos themselves live in
// the galleries and the shop.
export default function WatchlistPage() {
  useDocumentTitle('Watchlist');
  const toast = useToast();
  const { user, loading } = useAuthed();
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (!user) return;
    fetch(`${API}/watchlist`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((j) => setRows(Array.isArray(j?.data) ? j.data : []));
  }, [user]);

  const unwatch = async (w) => {
    try {
      await fetch(`${API}/watchlist/${w.id}`, { method: 'DELETE', credentials: 'include' });
    } catch { /* removed locally regardless */ }
    setRows((xs) => (xs || []).filter((x) => x.id !== w.id));
    toast(`Unfollowed ${w.name || 'stable'}`, { type: 'info' });
  };

  return (
    <PageShell eyebrow="Follow / Stable" title="Watchlist." wide
      intro="Riders and horses you follow. We notify you when their new photos publish.">
      {loading ? (
        <div className="event-media-empty"><p className="eyebrow">Loading…</p></div>
      ) : !user ? (
        <div className="event-media-empty">
          <p className="eyebrow">Members only</p>
          <h3>Follow your stable.</h3>
          <p>Get notified the moment their photos drop.</p>
          <p style={{ marginTop: 18 }}>
            <Link href="/login?next=/watchlist" className="primary-link">Sign in</Link>
          </p>
        </div>
      ) : rows === null ? (
        <div className="event-media-empty"><p className="eyebrow">Loading…</p></div>
      ) : !rows.length ? (
        <div className="event-media-empty">
          <p className="eyebrow">Nobody followed yet</p>
          <h3>Build your stable.</h3>
          <p>Hit Follow on any rider or horse photo page.</p>
          <p style={{ marginTop: 18 }}>
            <Link href="/events" className="primary-link">Browse galleries</Link>
          </p>
        </div>
      ) : (
        <div className="event-media-grid">
          {rows.map((w) => (
            <article className="event-media-card" key={w.id}>
              <div style={{ padding: '18px 16px' }}>
                <p className="eyebrow" style={{ textTransform: 'capitalize' }}>{w.entity_type}</p>
                <h3 style={{ margin: '8px 0 14px', fontSize: 18 }}>{w.name || 'Unnamed'}</h3>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <Link href={`/photos?q=${encodeURIComponent(w.name || '')}`} className="text-link">View photos</Link>
                  <button type="button" onClick={() => unwatch(w)} className="text-link">Unfollow</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </PageShell>
  );
}
