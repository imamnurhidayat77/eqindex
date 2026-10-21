'use client';
import Link from 'next/link';
import { useState } from 'react';

// Dark hero (the ONE dark surface): full-bleed jump photo with headline
// layered behind, viewfinder brackets + focus square, mono HUD with REAL
// data only, filmstrip of the event's latest photos (click swaps hero).
export default function Hero({ photos, eventName }) {
  const [idx, setIdx] = useState(0);
  const list = photos && photos.length ? photos : [];
  const cur = list[idx] || null;
  return (
    <section aria-label="Featured photos" style={{ background: '#101010', borderRadius: 16, overflow: 'hidden', marginBottom: 28 }}>
      <div className="viewfinder" style={{ position: 'relative', minHeight: 380 }}>
        <span className="vf" aria-hidden="true" />
        {cur && (cur.preview_url || cur.thumb_url) ? (
          <img src={cur.preview_url || cur.thumb_url} alt=""
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} />
        ) : null}
        <span className="focus-dot" aria-hidden="true" />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.25), rgba(0,0,0,.05) 40%, rgba(0,0,0,.55))' }} />
        <div style={{ position: 'relative', padding: '56px 32px 24px', maxWidth: 900 }}>
          <h1 className="display" style={{ color: '#fff', fontSize: 'clamp(48px, 7vw, 104px)', margin: 0 }}>
            EVERY STRIDE,<br />CAPTURED.
          </h1>
          <p style={{ color: '#EDEDEA', fontSize: 17, margin: '12px 0 20px', maxWidth: 560 }}>
            New Zealand&apos;s Riders and Horses. Elevated.
          </p>
          <p className="num" style={{ color: '#B9B9B4', fontSize: 12, letterSpacing: 1, fontFamily: 'var(--mono)' }}>
            {eventName || 'Latest event'} · {list.length} PHOTO{list.length === 1 ? '' : 'S'} ● LIVE
          </p>
        </div>
        {!!list.length && (
          <div style={{ position: 'relative', display: 'flex', gap: 8, padding: '0 32px 22px', overflowX: 'auto' }}>
            {list.slice(0, 8).map((p, i) => (
              <button key={p.id} onClick={() => setIdx(i)} aria-label={`Show photo ${i + 1}`}
                style={{ border: i === idx ? '2px solid #fff' : '2px solid transparent', borderRadius: 8,
                  padding: 0, cursor: 'pointer', background: 'none', flexShrink: 0, opacity: i === idx ? 1 : 0.75 }}>
                {(p.thumb_url || p.preview_url) && (
                  <img src={p.thumb_url || p.preview_url} alt="" loading="lazy"
                    style={{ width: 96, height: 64, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
                )}
              </button>
            ))}
            <span className="num" style={{ alignSelf: 'center', color: '#B9B9B4', fontSize: 12, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
              {String(idx + 1).padStart(2, '0')}/{String(Math.min(8, list.length)).padStart(2, '0')}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
