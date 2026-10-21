'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API } from '../../lib/api';
import { IconClose } from '../../components/icons';

// Favourites live in the browser (no account needed). Heart any photo to
// build this shelf; buying still happens on the photo page.
export default function FavouritesPage() {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let ids = [];
    try { ids = JSON.parse(localStorage.getItem('bossmedia:favourites') || '[]'); } catch {}
    if (!ids.length) { setItems([]); return; }
    Promise.all(ids.map((id) =>
      fetch(`${API}/photos/${id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    )).then((rs) => setItems(rs.map((r) => r?.data).filter(Boolean)));
  }, []);

  const remove = (id) => {
    setItems((xs) => (xs || []).filter((x) => x.id !== id));
    try {
      const ids = JSON.parse(localStorage.getItem('bossmedia:favourites') || '[]').filter((x) => x !== id);
      localStorage.setItem('bossmedia:favourites', JSON.stringify(ids));
    } catch {}
  };

  return (
    <>
      <h1 className="page-title">Favourites</h1>
      <p className="caption" style={{ margin: '6px 0 18px' }}>Saved on this device — no account needed. Tap a card to buy.</p>
      {items === null ? (
        <div className="grid">{[0, 1, 2, 3].map((i) => <span key={i} className="sk" style={{ aspectRatio: '4/3', borderRadius: 12 }} />)}</div>
      ) : !items.length ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <h3 className="card-title">Nothing saved yet</h3>
          <p className="caption">Tap the heart on any photo to keep it here.</p>
          <p style={{ marginTop: 16 }}><Link href="/photos" className="btn btn-primary btn-md">Browse photos</Link></p>
        </div>
      ) : (
        <div className="grid">
          {items.map((x) => (
            <div key={x.id} className="card photo-card" style={{ position: 'relative' }}>
              <Link href={`/p/${x.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                {x.thumb_url || x.preview_url
                  ? <img src={x.thumb_url || x.preview_url} alt="" loading="lazy" />
                  : <div style={{ aspectRatio: '4/3', display: 'grid', placeItems: 'center', background: '#eceae4' }} />}
                <div className="cap">
                  <b>{[x.horse, x.rider].filter(Boolean).join(' × ') || x.event_name || ''}</b>
                  <span>{x.event_name || ''}</span>
                </div>
              </Link>
              <button onClick={() => remove(x.id)} aria-label="Remove from favourites"
                style={{ position: 'absolute', top: 10, right: 10, width: 36, height: 36, borderRadius: '50%',
                  border: '1px solid rgba(255,255,255,.7)', background: '#1F3D2E', color: '#fff', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconClose />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
