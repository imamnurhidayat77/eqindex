'use client';
import { useRef, useState, useEffect } from 'react';
import { CARD, LINK } from '../lib/tokens';

export default function EventCarousel({ events }) {
  const ref = useRef(null);
  const [canL, setCanL] = useState(false);
  const [canR, setCanR] = useState(true);
  const update = () => {
    const el = ref.current;
    if (!el) return;
    setCanL(el.scrollLeft > 8);
    setCanR(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  };
  useEffect(() => { update(); }, []);
  const slide = (dir) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.8, 560), behavior: 'smooth' });
  };
  if (!events.length) {
    return <section className={CARD}><p className="text-muted text-sm">No events found.</p></section>;
  }
  return (
    <section className={CARD}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[13px] font-bold">Latest Events <span className="text-faint font-semibold">· newest first</span></div>
        <div className="flex items-center gap-1.5">
          <a href="/events" className={`${LINK} text-[12px] mr-2`}>View all →</a>
          <button onClick={() => slide(-1)} disabled={!canL} aria-label="Previous"
            className="w-8 h-8 rounded border border-line bg-card2 text-body disabled:opacity-30 hover:text-gold">‹</button>
          <button onClick={() => slide(1)} disabled={!canR} aria-label="Next"
            className="w-8 h-8 rounded border border-line bg-card2 text-body disabled:opacity-30 hover:text-gold">›</button>
        </div>
      </div>
      <div ref={ref} onScroll={update}
        className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory"
        style={{ scrollbarWidth: 'thin' }}>
        {events.map((e) => (
          <a key={e.id} href={`/events/${e.id}`}
            className="snap-start shrink-0 w-[240px] bg-card2 border border-line rounded p-4 no-underline hover:border-gold/60 transition-colors group">
            <div className="text-[11px] text-faint">{(e.date_start || '').slice(0, 10)}</div>
            <div className="mt-1 font-bold text-[14px] leading-snug text-white group-hover:text-gold line-clamp-2 min-h-[40px]">{e.name}</div>
            <div className="mt-1 text-[12px] text-muted truncate">{e.venue || '—'}{e.region ? ` · ${e.region}` : ''}</div>
            <div className="mt-2.5 flex gap-3 text-[12px]">
              <span className="text-muted"><b className="text-body">{e.class_count ?? '–'}</b> classes</span>
              <span className="text-muted"><b className="text-body">{e.round_count ?? '–'}</b> rounds</span>
            </div>
            <div className="mt-2.5 text-[12px] font-bold text-gold">VIEW RESULTS →</div>
          </a>
        ))}
      </div>
    </section>
  );
}
