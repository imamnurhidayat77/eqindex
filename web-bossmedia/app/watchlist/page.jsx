'use client';
import SmartImage from '../../components/SmartImage';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API } from '../../lib/api';
import { useAuthed } from '../../lib/use-authed';
import { useDocumentTitle } from '../../lib/use-document-title';
import { useToast } from '../../components/Toaster';
import { Icon } from '../../components/figma';
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

  const [shots, setShots] = useState({});

  useEffect(() => {
    if (!rows?.length) return;
    let live = true;
    Promise.all(rows.map(async (w) => {
      const p = new URLSearchParams({ limit: '6' });
      if (w.entity_type === 'horse') p.set('horse_id', w.entity_id);
      else if (w.entity_type === 'rider') p.set('rider_id', w.entity_id);
      else if (w.entity_type === 'event') p.set('event_id', w.entity_id);
      else {
        if (w.horse_id) p.set('horse_id', w.horse_id);
        if (w.rider_id) p.set('rider_id', w.rider_id);
      }
      try {
        const r = await fetch(`${API}/photos?${p}`, { credentials: 'include' });
        const j = await r.json().catch(() => ({}));
        return [w.id, Array.isArray(j?.data) ? j.data.slice(0, 6) : []];
      } catch { return [w.id, []]; }
    })).then((pairs) => { if (live) setShots(Object.fromEntries(pairs)); });
    return () => { live = false; };
  }, [rows]);

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
        <div style={{ display: 'grid', gap: 44 }}>
          {rows.map((w) => {
            const pics = shots[w.id] || [];
            return (
              <section key={w.id} aria-label={`${w.name || 'Stable'} photos`}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
                  <p className="eyebrow" style={{ textTransform: 'capitalize', margin: 0 }}>{w.entity_type}</p>
                  <h3 style={{ margin: 0, fontSize: 22 }}>{w.name || 'Unnamed'}</h3>
                  {pics.length > 1 && <small style={{ color: '#666', fontSize: 12 }}>{pics.length} photos</small>}
                  <span style={{ display: 'flex', gap: 16, marginLeft: 'auto' }}>
                    <Link href={`/photos?q=${encodeURIComponent(w.name || '')}`} className="text-link">View all</Link>
                    <button type="button" onClick={() => unwatch(w)} className="text-link">Unfollow</button>
                  </span>
                </div>
                {pics.length ? (
                  <div className="event-media-grid">
                    {pics.map((x) => (
                      <Link className="event-media-card" key={x.id} href={`/p/${x.id}`}
                        aria-label={`${x.horse || ''} ${x.rider || ''}`.trim() || 'Photo'}>
                        {x.thumb_url || x.preview_url
                          ? <SmartImage src={x.thumb_url || x.preview_url} alt={[x.horse, x.rider].filter(Boolean).join(' · ') || x.event_name || 'Watchlist photo'} width={800} height={600} sizes="(max-width: 768px) 100vw, 50vw" />
                          : <span className="cover-fallback">Boss Media</span>}
                        <span className="media-card-footer">
                          <small title={x.event_name || ''}>{x.event_name || '—'}</small>
                          <span className="media-card-title">
                            <strong>View photo</strong>
                            <Icon name="arrow" size={15} />
                          </span>
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="empty-note">No published photos yet — we notify you the moment they drop.</p>
                )}
              </section>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
