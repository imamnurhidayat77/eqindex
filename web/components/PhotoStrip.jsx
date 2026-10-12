'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API } from '../lib/api';

// Latest published photos for an identity (horse/rider/event) + count link.
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
      <div className="flex items-baseline justify-between mb-2.5">
        <h2 className="text-[15px] font-bold">{title} <span className="text-faint font-semibold">· {rows.length}</span></h2>
        <Link href={moreHref} className="text-sky text-[12px] no-underline hover:underline">View all →</Link>
      </div>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2.5">
        {shown.map((x) => (
          <Link key={x.id} href={`/photos/${x.id}`} className="block rounded border border-line bg-card overflow-hidden no-underline hover:border-gold/50">
            <div className="aspect-[4/3] bg-card2 flex items-center justify-center overflow-hidden">
              {x.thumb_url || x.preview_url
                ? <img src={x.thumb_url || x.preview_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                : <span className="text-xl">{x.kind === 'reel' ? '🎬' : '📷'}</span>}
            </div>
          </Link>
        ))}
        {!!extra && (
          <Link href={moreHref} className="rounded border border-line bg-card2 no-underline hover:border-gold/50 flex items-center justify-center min-h-[80px]">
            <span className="text-gold text-[13px] font-bold">+{extra} more →</span>
          </Link>
        )}
      </div>
    </section>
  );
}
