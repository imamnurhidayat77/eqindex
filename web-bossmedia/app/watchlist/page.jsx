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
import ReelPlayer from '../../components/ReelPlayer';

// Who you follow: riders, horses, and events. New published photos of them
// trigger a notification (see the publish hook) — the photos themselves
// live in the galleries and the shop, moments in the moments feed.
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
        const shop = Array.isArray(j?.data) ? j.data.slice(0, 6) : [];
        // Event rows also surface community moments (the near-live use case:
        // grandparents following a show). Moments link to their own pages.
        if (w.entity_type === 'event') {
          const q = new URLSearchParams({ limit: '6', event_id: w.entity_id });
          const mr = await fetch(`${API}/api/moments?${q}`, { credentials: 'include' });
          const mj = await mr.json().catch(() => ({}));
          // Flag name must NOT collide with the media.moment column
          // (win/clear/…) that shop rows already carry — that collision once
          // marked every tagged shop photo as community.
          const moments = Array.isArray(mj?.data) ? mj.data.map((m) => ({ ...m, isCommunity: true })) : [];
          return [w.id, [...moments.slice(0, 3), ...shop].slice(0, 6)];
        }
        return [w.id, shop];
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

  // Flat browsing order across every followed subject, in display order.
  // The lightbox walks this list so one viewer covers shop + moments.
  const flat = (rows || []).flatMap((w) => (shots[w.id] || []).map((x) => ({ ...x, rowName: w.name })));
  const [light, setLight] = useState(null); // index into flat, null = closed
  const openLight = (id) => {
    const i = flat.findIndex((x) => x.id === id);
    if (i >= 0) setLight(i);
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
                    {w.entity_type === 'event' ? (
                      <Link href={`/moments?event_id=${w.entity_id}`} className="text-link">View all</Link>
                    ) : (
                      <Link href={`/photos?q=${encodeURIComponent(w.name || '')}`} className="text-link">View all</Link>
                    )}
                    <button type="button" onClick={() => unwatch(w)} className="text-link">Unfollow</button>
                  </span>
                </div>
                {pics.length ? (
                  <div className="event-media-grid">
                    {pics.map((x) => (
                      <Link className="event-media-card" key={x.id} href={x.isCommunity ? `/moments/${x.id}` : `/p/${x.id}`}
                        onClick={(e) => { e.preventDefault(); openLight(x.id); }}
                        aria-label={`${x.horse || ''} ${x.rider || ''}`.trim() || 'Photo'}>
                        {x.thumb_url || x.preview_url
                          ? <SmartImage src={x.thumb_url || x.preview_url} alt={[x.horse, x.rider].filter(Boolean).join(' · ') || x.event_name || 'Watchlist photo'} width={800} height={600} sizes="(max-width: 768px) 100vw, 50vw" />
                          : <span className="cover-fallback">Boss Media</span>}
                        <span className="media-card-footer">
                          <small title={x.event_name || ''}>
                            {x.isCommunity && <span className="st-chip" style={{ marginRight: 6 }}>Community</span>}
                            {x.event_name || '—'}
                          </small>
                          <span className="media-card-title">
                            <strong>{x.isCommunity ? 'View moment' : 'View photo'}</strong>
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
      {light !== null && flat.length > 0 && (
        <Lightbox item={flat[Math.min(light, flat.length - 1)]} index={Math.min(light, flat.length - 1)} total={flat.length}
          flatList={flat}
          onJump={setLight}
          onPrev={() => setLight((i) => Math.max(0, i - 1))}
          onNext={() => setLight((i) => Math.min(flat.length - 1, i + 1))}
          onClose={() => setLight(null)} />
      )}
    </PageShell>
  );
}

// Full-screen viewer over the flat watchlist order: arrows + keyboard walk
// shop photos and community moments without leaving the page. Commerce stays
// on the detail pages (View & buy / View moment links below the caption).
function Lightbox({ item, index, total, flatList, onJump, onPrev, onNext, onClose }) {
  useEffect(() => {
    document.querySelector('[data-lb-active="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [index]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') onPrev();
      else if (e.key === 'ArrowRight') onNext();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onPrev, onNext, onClose]);
  if (!item) return null;
  const caption = [item.horse, item.rider].filter(Boolean).join(' × ') || item.event_name || 'Untitled';
  const href = item.isCommunity ? `/moments/${item.id}` : `/p/${item.id}`;
  return (
    <div role="dialog" aria-modal="true" aria-label={caption}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.92)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <button type="button" onClick={onClose} aria-label="Close viewer"
        style={{ position: 'absolute', top: 14, right: 14, width: 44, height: 44, borderRadius: '50%', border: '1px solid #555', background: 'transparent', color: '#fff', fontSize: 18, cursor: 'pointer' }}>×</button>
      <button type="button" onClick={onPrev} disabled={index <= 0} aria-label="Previous photo"
        style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: '50%', border: '1px solid #555', background: 'rgba(0,0,0,.5)', color: '#fff', fontSize: 20, cursor: 'pointer', opacity: index <= 0 ? 0.3 : 1 }}>‹</button>
      <button type="button" onClick={onNext} disabled={index >= total - 1} aria-label="Next photo"
        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: '50%', border: '1px solid #555', background: 'rgba(0,0,0,.5)', color: '#fff', fontSize: 20, cursor: 'pointer', opacity: index >= total - 1 ? 0.3 : 1 }}>›</button>
      <div role="tablist" aria-label="All photos and videos"
        style={{ display: 'flex', gap: 8, justifyContent: 'safe center', overflowX: 'auto', maxWidth: 1100, width: '100%', padding: '4px 2px 10px', scrollbarWidth: 'thin' }}>
        {(flatList || []).map((x, i) => (
          <button key={x.id} type="button" role="tab" aria-selected={i === index} data-lb-active={i === index} aria-label={`Go to ${i + 1} of ${total}`}
            onClick={() => onJump(i)}
            style={{ flex: 'none', padding: 0, background: 'none', border: i === index ? '2px solid #fff' : '2px solid transparent', borderRadius: 6, cursor: 'pointer', opacity: i === index ? 1 : 0.55 }}>
            <span className="st-tagthumb" style={{ display: 'block' }}>
              {(x.thumb_url || x.preview_url)
                ? <SmartImage src={x.thumb_url || x.preview_url}
                  alt={`${[x.horse, x.rider].filter(Boolean).join(' · ') || x.event_name || `Photo ${i + 1}`}`}
                  width={128} height={96} sizes="128px" />
                : <span className="st-tagthumb-fallback">·</span>}
              {x.kind === 'reel' && <i>▶</i>}
            </span>
          </button>
        ))}
      </div>
      <figure style={{ margin: 0, maxWidth: 1100, width: '100%', display: 'grid', gap: 10, justifyItems: 'center' }}>
        {item.kind === 'reel' && item.preview_url ? (
          <div style={{ width: '100%', maxHeight: '72vh', overflow: 'hidden', borderRadius: 8 }}>
            <ReelPlayer src={item.preview_url} poster={item.thumb_url || null} label={caption} />
          </div>
        ) : (item.preview_url || item.thumb_url) ? (
          <SmartImage src={item.preview_url || item.thumb_url} alt={caption}
            width={item.width || 1600} height={item.height || 1000} sizes="100vw"
            style={{ width: '100%', height: 'auto', maxHeight: '72vh', objectFit: 'contain', borderRadius: 8 }} />
        ) : (
          <span className="cover-fallback">Boss Media</span>
        )}
        <figcaption style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center', color: '#bbb', fontSize: 13 }}>
          <span style={{ color: '#777' }}>{index + 1} of {total}</span>
          {item.isCommunity && <span className="st-chip">Community</span>}
          <strong style={{ color: '#fff', fontWeight: 600 }}>{caption}</strong>
          <Link href={href} className="text-link">{item.isCommunity ? 'View moment →' : 'View & buy →'}</Link>
        </figcaption>
      </figure>
    </div>
  );
}
