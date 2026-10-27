'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API } from '../../lib/api';
import { readFavourites, removeFavourite } from '../../lib/favourites';
import { Icon } from '../../components/figma';
import GalleryPager from '../../components/GalleryPager';
import { useToast } from '../../components/Toaster';
import PageShell from '../../components/PageShell';

const LIMIT = 12;

// Favourites live in the browser (no account needed). Buying happens on
// the photo page.
export default function FavouritesPage() {
  const toast = useToast();
  const [me, setMe] = useState(undefined); // undefined = checking
  const [items, setItems] = useState(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetch(`${API}/auth/me`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setMe(j?.data || null))
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    if (!me) return;
    const ids = readFavourites();
    if (!ids.length) { setItems([]); return; }
    Promise.all(ids.map((id) =>
      fetch(`${API}/photos/${id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    )).then((rs) => setItems(rs.map((r) => r?.data).filter(Boolean)));
  }, [me]);

  function remove(id) {
    const gone = (items || []).find((x) => x.id === id);
    setItems((xs) => (xs || []).filter((x) => x.id !== id));
    toast(`Removed${gone ? ` — ${[gone.horse, gone.rider].filter(Boolean).join(' · ') || 'photo'}` : ''}`, { type: 'info' });
    removeFavourite(id);
  }

  const pages = Math.max(1, Math.ceil((items || []).length / LIMIT));
  const safePage = Math.min(page, pages);

  return (
    <PageShell eyebrow="Saved / Members" title="Favourites." wide
      intro="Your saved photos on this device — members only. Tap a card to buy.">
      {me === undefined ? (
        <div className="event-media-empty"><p className="eyebrow">Loading…</p></div>
      ) : !me ? (
        <div className="event-media-empty">
          <p className="eyebrow">Members only</p>
          <h3>Log in to see your favourites.</h3>
          <Link href="/login?next=/favourites" style={{ paddingBottom: 6, borderBottom: '1px solid #555', fontSize: 13, color: '#bbb' }}>Log in</Link>
        </div>
      ) : items === null ? (
        <div className="event-media-empty"><p className="eyebrow">Loading…</p></div>
      ) : !items.length ? (
        <div className="event-media-empty">
          <p className="eyebrow">Nothing saved yet</p>
          <h3>Find a moment worth keeping.</h3>
          <Link href="/events" style={{ paddingBottom: 6, borderBottom: '1px solid #555', fontSize: 13, color: '#bbb' }}>Browse galleries</Link>
        </div>
      ) : (
        <div className="event-media-grid">
          {(items || []).slice((safePage - 1) * LIMIT, safePage * LIMIT).map((x) => (
            <article className="event-media-card" key={x.id} style={{ position: 'relative' }}>
              <Link href={`/p/${x.id}`} style={{ display: 'block' }} aria-label={`${x.horse || ''} ${x.rider || ''}`.trim() || 'Photo'}>
                {x.thumb_url || x.preview_url
                  ? <img src={x.thumb_url || x.preview_url} alt={`${[x.horse, x.rider].filter(Boolean).join(' ridden by ') || 'Saved equestrian photo'}${x.event_name ? ` at ${x.event_name}` : ''}`} loading="lazy" />
                  : <span className="cover-fallback">Boss Media</span>}
                <span className="media-card-footer">
                  <small title={x.event_name || ''}>{x.event_name || '—'}</small>
                  <span className="media-card-title">
                    <strong>{[x.horse, x.rider].filter(Boolean).join(' · ') || x.other_people || x.event_name || 'Untagged'}</strong>
                    <Icon name="arrow" size={15} />
                  </span>
                </span>
              </Link>
              <button onClick={() => remove(x.id)} aria-label="Remove from favourites"
                style={{ position: 'absolute', top: 17, right: 17, zIndex: 2, width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: '50%', border: '1px solid rgba(255,255,255,.6)', background: 'rgba(0,0,0,.6)', color: '#fff', cursor: 'pointer' }}>
                <Icon name="close" size={15} />
              </button>
            </article>
          ))}
          <GalleryPager page={safePage} pages={pages} onPage={setPage} />
        </div>
      )}
    </PageShell>
  );
}
