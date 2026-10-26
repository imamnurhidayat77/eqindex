'use client';
import { useEffect, useState } from 'react';
import { API } from '../lib/api';
import { bossPhotoUrl } from '../lib/bossmedia';

const MOMENT = { win: 'Win', clear: 'Clear round', debut: 'Debut', pb: 'PB' };

// Latest published photos for an identity (horse/rider/event) as display
// cards. Nothing is sold here — every card opens the photo on Boss Media
// in a new tab, where buying happens.
export default function PhotoStrip({ query, title = 'Photos', moreHref = '/photos' }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    const p = new URLSearchParams({ limit: '7', ...query });
    fetch(`${API}/photos?${p}`).then((r) => r.json()).then((j) => setRows(j.data || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(query)]);
  const shown = rows.slice(0, 6);
  const extra = rows.length - shown.length;
  if (!rows.length) return null;
  return (
    <section className="mb-6">
      <div className="mb-2.5 flex items-center gap-2.5">
        <h2 className="text-[15px] font-bold">{title}</h2>
        <span className="rounded-full border border-line px-2 py-px text-[11px] font-bold text-muted">
          {rows.length}{rows.length >= 7 ? '+' : ''}
        </span>
        <span className="flex-1" />
        <a href={moreHref} target="_blank" rel="noreferrer" className="text-sky text-[12px] no-underline hover:underline">View all →</a>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {shown.map((x) => {
          const caption = [x.horse, x.rider].filter(Boolean).join(' × ') || x.event_name || 'Untagged';
          return (
            <a key={x.id} href={bossPhotoUrl(x.id)} target="_blank" rel="noreferrer" aria-label={`${caption} — opens on Boss Media`}
              className="group flex flex-col rounded-lg border border-line bg-card overflow-hidden no-underline hover:border-gold/50 transition">
              <div className="relative aspect-[4/3] bg-card2 flex items-center justify-center overflow-hidden">
                {x.thumb_url || x.preview_url
                  ? <img src={x.thumb_url || x.preview_url} alt={caption} loading="lazy" decoding="async"
                      className="w-full h-full object-cover group-hover:scale-[1.04] transition duration-300" />
                  : <span className="text-xl">{x.kind === 'reel' ? '🎬' : '📷'}</span>}
                {x.kind === 'reel' && (
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-white">
                    ▶ Reel
                  </span>
                )}
                {x.moment && MOMENT[x.moment] && (
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-goldbg/85 px-1.5 py-px text-[10px] font-bold text-gold">
                    {MOMENT[x.moment]}
                  </span>
                )}
              </div>
              <div className="flex grow flex-col gap-0.5 p-2">
                <div className="text-[12.5px] font-bold text-white truncate group-hover:text-gold transition">{caption}</div>
                <div className="mt-auto flex items-center justify-between pt-0.5">
                  <span className="text-[10.5px] text-faint">{x.kind === 'reel' ? 'Video' : 'Photo'}</span>
                  <span className="text-[10.5px] text-faint">Boss Media ↗</span>
                </div>
              </div>
            </a>
          );
        })}
        {!!extra && (
          <a href={moreHref} target="_blank" rel="noreferrer"
              className="group flex min-h-[120px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gold/40 bg-goldbg/10 no-underline hover:border-gold hover:bg-goldbg/20 transition">
            <span className="text-[20px] font-extrabold text-gold">+{extra}</span>
            <span className="text-[11.5px] font-bold text-muted group-hover:text-gold">View all →</span>
          </a>
        )}
      </div>
    </section>
  );
}
