'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API } from '../lib/api';

const nzd = (c) => (c === null || c === undefined ? null : `NZ$${(Number(c) / 100).toFixed(2)}`);

// Cross-upsell bundle (P2C): on a photo, show the reels of the same
// event × subject — and vice versa. "Complete the moment."
// Only showcase reels ever appear here (the catalog filters private ones).
export default function MomentBundle({ eventId, horseId, riderId, currentId, currentKind }) {
  const [rows, setRows] = useState(null);
  const want = currentKind === 'reel' ? 'photo' : 'reel';

  useEffect(() => {
    if (!eventId || (!horseId && !riderId)) return;
    const p = new URLSearchParams({ event_id: eventId, kind: want, limit: '5' });
    if (horseId) p.set('horse_id', horseId); else p.set('rider_id', riderId);
    fetch(`${API}/photos?${p}`).then((r) => r.json()).then((j) => {
      const list = (Array.isArray(j.data) ? j.data : []).filter((x) => x.id !== currentId).slice(0, 4);
      setRows(list);
    }).catch(() => setRows([]));
  }, [eventId, horseId, riderId, currentId, want]);

  if (!rows || !rows.length) return null;
  return (
    <div className="mt-3 rounded-lg border border-line bg-card2 p-3">
      <div className="text-[11px] uppercase tracking-wide text-faint font-bold mb-2">
        {want === 'reel' ? 'Reels of this round' : 'Photos of this round'}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {rows.map((x) => {
          const price = nzd(x.price_cents);
          return (
            <Link key={x.id} href={`/photos/${x.id}`}
              aria-label={[x.horse, x.rider].filter(Boolean).join(' × ') || x.event_name || (want === 'reel' ? 'Reel' : 'Photo')}
              className="group rounded-lg border border-line bg-card overflow-hidden no-underline hover:border-gold/50 transition">
              <div className="relative aspect-[4/3] bg-card flex items-center justify-center overflow-hidden">
                {x.thumb_url || x.preview_url
                  ? <img src={x.thumb_url || x.preview_url} alt={[x.horse, x.rider].filter(Boolean).join(' × ') || `${x.event_name || 'Show-jumping'} ${want}`} loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.04] transition duration-300" />
                  : <span className="text-xl" aria-hidden="true">{want === 'reel' ? '🎬' : '📷'}</span>}
                {want === 'reel' && (
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-1.5 py-px text-[10px] font-bold text-white">▶ Reel</span>
                )}
              </div>
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-[11.5px] font-bold text-white truncate">
                  {[x.horse, x.rider].filter(Boolean).join(' × ') || x.event_name || ''}
                </span>
                {price && <span className="ml-1 shrink-0 text-[11px] font-bold text-gold tabular-nums">from {price}</span>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
