'use client';
import Link from 'next/link';
import { useRef, useState, useEffect } from 'react';
import { CARD, LINK, badge, BADGE } from '../lib/tokens';
import { EmptyState } from './EmptyState';

const statusBadge = (s) => {
  if (s === 'official') return badge(BADGE.green);
  if (s === 'complete') return badge(BADGE.blue);
  if (s === 'provisional') return badge(BADGE.goldfill);
  return null;
};

const fmtDay = (d) => (d || '').slice(0, 10);
const fmtUpdated = (d) => {
  if (!d) return null;
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 0) return fmtDay(d);
  const h = diff / 36e5;
  if (h < 24) return `${Math.max(1, Math.round(h))}h ago`;
  if (h < 24 * 7) return `${Math.round(h / 24)}d ago`;
  return fmtDay(d);
};

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
    return (
      <section className={CARD}>
        <EmptyState
          icon="📅"
          title="No events to show"
          hint="New events appear here as results are published."
          action={<Link href="/events" className={LINK}>Browse all events →</Link>}
        />
      </section>
    );
  }
  return (
    <section className={CARD}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[13px] font-bold">Latest Events <span className="text-faint font-semibold">· newest first</span></div>
        <div className="flex items-center gap-1.5">
          <Link href="/events" className={`${LINK} text-[12px] mr-2`}>View all →</Link>
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
          <Link key={e.id} href={`/events/${e.slug || e.id}`}
            className="snap-start shrink-0 w-[240px] bg-card2 border border-line rounded p-4 no-underline hover:border-gold/60 transition-colors group">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-faint">{fmtDay(e.date_start)}{e.date_end && e.date_end !== e.date_start ? ` → ${fmtDay(e.date_end)}` : ''}</span>
              {e.status && <span className={statusBadge(e.status)}>{e.status[0].toUpperCase() + e.status.slice(1)}</span>}
            </div>
            <div className="mt-1 font-bold text-[14px] leading-snug text-white group-hover:text-gold line-clamp-2 min-h-[40px]">{e.name}</div>
            <div className="mt-1 text-[12px] text-muted truncate">{e.venue || '—'}{e.region ? ` · ${e.region}` : ''}</div>
            <div className="mt-2.5 flex gap-3 text-[12px]">
              <span className="text-muted"><b className="text-body">{e.class_count ?? '–'}</b> classes</span>
              <span className="text-muted"><b className="text-body">{e.combo_count ?? e.round_count ?? '–'}</b> combos</span>
            </div>
            {e.updated_at && <div className="mt-1 text-[11px] text-faint">Updated {fmtUpdated(e.updated_at)}</div>}
            <div className="mt-2 text-[12px] font-bold text-gold">VIEW RESULTS →</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
