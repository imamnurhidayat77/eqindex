'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API } from '../../lib/api';

function useAuthed() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`${API}/auth/me`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setUser(j?.data || null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  return { user, loading };
}

const nzd = (c) => `NZ$${(Number(c || 0) / 100).toFixed(2)}`;
const TABS = [['photos', 'Photos'], ['reels', 'Reels'], ['credits', 'Credits']];

export default function MediaHub() {
  const { user, loading } = useAuthed();
  const [tab, setTab] = useState('photos');
  const [photos, setPhotos] = useState(null);
  const [reels, setReels] = useState(null);
  const [credits, setCredits] = useState(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (loading || !user) return;
    fetch(`${API}/api/my/photos`, { credentials: 'include' }).then((r) => r.json()).then((j) => setPhotos(j.data || [])).catch(() => setPhotos([]));
    fetch(`${API}/api/my/reels`, { credentials: 'include' }).then((r) => r.json()).then((j) => setReels(j.data || [])).catch(() => setReels([]));
    fetch(`${API}/api/my/credits`, { credentials: 'include' }).then((r) => r.json()).then((j) => {
      const rows = j.data || [];
      setCredits(rows);
      setTotal(rows.reduce((s, b) => s + Number(b.slots_left || 0), 0));
    }).catch(() => setCredits([]));
  }, [loading, user]);

  if (loading) return (<><div className="card" style={{ padding: 18, marginBottom: 14 }}><span className="sk" style={{ display: 'block', height: 34, borderRadius: 10 }} /></div><div className="grid">{[0,1,2,3].map((i) => <span key={i} className="sk" style={{ aspectRatio: '4/3', borderRadius: 12 }} />)}</div></>)
  if (!user) {
    return (
      <>
        <h1 className="page-title">My media</h1>
        <p className="caption">Log in to see everything you own — photos, reels and credits.</p>
        <p style={{ marginTop: 16 }}><Link href="/login?next=/media" className="btn btn-primary btn-md">Log in</Link></p>
      </>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 className="page-title">My media</h1>
        {Number(total) > 0 && (
          <Link href="/media" onClick={(e) => { e.preventDefault(); setTab('credits'); }}
            className="badge badge-amber num" style={{ textDecoration: 'none' }}>{total} credits left</Link>
        )}
        <span style={{ flex: 1 }} />
        <Link href="/photos" className="btn btn-secondary btn-sm">Buy more →</Link>
      </div>
      <p className="caption" style={{ margin: '6px 0 18px' }}>Everything you own in one place.</p>

      <div style={{ display: 'flex', gap: 4, background: '#fff', border: '1px solid #E7E2D8', borderRadius: 10, padding: 4, width: 'fit-content', marginBottom: 18 }} role="tablist" aria-label="My media">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            style={{ padding: '8px 18px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', border: 0,
              background: tab === k ? '#1F3D2E' : 'transparent', color: tab === k ? '#fff' : '#5E5B55' }}>
            {label}
            {k === 'photos' && Array.isArray(photos) ? ` (${photos.length})` : ''}
            {k === 'reels' && Array.isArray(reels) ? ` (${reels.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'photos' && (
        !photos ? <div className="grid">{[0,1,2,3].map((i) => <span key={i} className="sk" style={{ aspectRatio: '4/3', borderRadius: 12 }} />)}</div> : !photos.length ? (
          <div className="card" style={{ padding: 40, textAlign: 'center' }}>
            <h3 className="card-title">No purchases yet</h3>
            <p className="caption">Bought photos appear here with lifetime re-downloads.</p>
            <p style={{ marginTop: 16 }}><Link href="/photos" className="btn btn-primary btn-md">Browse the gallery</Link></p>
          </div>
        ) : (
          <div className="grid">
            {photos.map((x) => (
              <div key={`${x.purchase_id}-${x.media_id}`} className="card photo-card">
                {x.thumb_url || x.preview_url
                  ? <img src={x.thumb_url || x.preview_url} alt="" loading="lazy" />
                  : <div style={{ aspectRatio: '4/3', background: '#eceae4' }} />}
                <div className="cap">
                  <b>{[x.horse, x.rider].filter(Boolean).join(' × ') || x.event_name || 'Photo'}</b>
                  <span>{x.event_name || ''}</span>
                </div>
                <div className="row">
                  <span className="caption">{x.license_tier || ''}</span>
                  <a href={`${API}/api/media/${x.media_id}/download`} className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>Download</a>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'reels' && (
        !reels ? <div className="grid">{[0,1].map((i) => <span key={i} className="sk" style={{ aspectRatio: '16/9', borderRadius: 12 }} />)}</div> : !reels.length ? (
          <div className="card" style={{ padding: 40, textAlign: 'center' }}>
            <h3 className="card-title">No reel orders yet</h3>
            <p className="caption">Order a custom reel and track it here.</p>
            <p style={{ marginTop: 16 }}><Link href="/reels" className="btn btn-primary btn-md">Order a reel</Link></p>
          </div>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {reels.map((o) => (
              <div key={o.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {o.preview_url && ['ready', 'delivered'].includes(o.status)
                  ? <video src={o.preview_url} controls preload="metadata" poster={o.thumb_url || undefined} style={{ width: '100%', aspectRatio: '16/9', background: '#000' }} />
                  : <div style={{ padding: 24, textAlign: 'center' }} className="caption">
                      {({ awaiting_payment: 'Waiting for payment', pending: 'Queued for production', in_production: 'Being filmed and edited', ready: 'Ready', delivered: 'Delivered', cancelled: 'Cancelled' })[o.status] || o.status}
                    </div>}
                <div style={{ padding: 14 }}>
                  <b>{o.product_name} — {o.horse_name}</b>
                  <div className="caption">{o.event_name || ''} · {String(o.status).replace(/_/g, ' ')}</div>
                  {o.media_id && ['ready', 'delivered'].includes(o.status) && (
                    <p style={{ margin: '10px 0 0' }}>
                      <a href={`${API}/api/media/${o.media_id}/download`} className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>Download full file</a>
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'credits' && (
        !credits ? <div className="grid">{[0,1].map((i) => <span key={i} className="sk" style={{ height: 150, borderRadius: 12 }} />)}</div> : !credits.length ? (
          <div className="card" style={{ padding: 40, textAlign: 'center' }}>
            <h3 className="card-title">No credits yet</h3>
            <p className="caption">Grab a 5-pack on any photo to unlock individually.</p>
            <p style={{ marginTop: 16 }}><Link href="/photos" className="btn btn-primary btn-md">Browse photos</Link></p>
          </div>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {credits.map((b) => {
              const total = Number(b.slots_total) || 0;
              const left = Number(b.slots_left ?? total) || 0;
              const qp = new URLSearchParams();
              if (b.event_id) qp.set('event', b.event_id);
              if (b.horse_id) qp.set('horse', b.horse_id);
              else if (b.rider_id) qp.set('rider', b.rider_id);
              return (
                <div key={b.id} className="card" style={{ padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <b>{[b.horse, b.rider].filter(Boolean).join(' × ') || 'Bundle'}</b>
                    <span className="num" style={{ fontSize: 22, fontWeight: 800 }}>{left}<span className="caption">/{total} left</span></span>
                  </div>
                  <div className="caption">{b.event_name || ''}</div>
                  <div style={{ display: 'flex', gap: 4, margin: '10px 0' }}>
                    {Array.from({ length: total }).map((_, i) => (
                      <span key={i} style={{ height: 8, flex: 1, borderRadius: 99, background: i < total - left ? '#E7E2D8' : '#1F3D2E' }} />
                    ))}
                  </div>
                  <Link href={`/photos?${qp}`} className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>Browse photos to unlock →</Link>
                </div>
              );
            })}
          </div>
        )
      )}
    </>
  );
}
