'use client';
import Link from 'next/link';
import { useRef, useState, useEffect } from 'react';
import { CARD, LINK, badge, BADGE } from '../lib/tokens';
import { EmptyState } from './EmptyState';

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

const hasData = (e) =>
  Number(e.class_count || 0) > 0 || Number(e.round_count || 0) > 0 || Number(e.combo_count || 0) > 0;
const isFuture = (e) => {
  if (!e.date_start) return false;
  const d = new Date(e.date_start);
  if (Number.isNaN(d.getTime())) return false;
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return d > t;
};

// kind: 'results' (finished events with data) | 'upcoming' (fixtures not yet started)
export default function EventCarousel({ events, kind = 'results' }) {
  const upcoming = kind === 'upcoming';
  // Safety net: results never show placeholders with no results;
  // upcoming never shows events that already started.
  const list = (events || []).filter((e) => (upcoming ? isFuture(e) : hasData(e)));
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
  if (!list.length) {
    return (
      <section className={CARD}>
        <EmptyState
          icon="📅"
          title={upcoming ? 'No upcoming events scheduled' : 'No events to show'}
          hint={upcoming
            ? 'Future fixtures will appear here once the calendar is published.'
            : 'New events appear here as results are published.'}
          action={<Link href="/events" className={LINK}>Browse all events →</Link>}
        />
      </section>
    );
  }
  return (
    <section className={`${CARD} !bg-card2/60`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="font-display text-[17px] font-bold uppercase tracking-wide">{upcoming ? 'Upcoming Events' : 'Latest Events'}</div>
        <div className="flex items-center gap-1.5">
          <Link href="/events" className={`${LINK} text-[12px] mr-2`}>View all →</Link>
          <button onClick={() => slide(-1)} disabled={!canL} aria-label="Previous"
            className="w-8 h-8 rounded-md border border-line bg-card text-body disabled:opacity-30 hover:text-gold hover:border-gold/50 transition-colors">‹</button>
          <button onClick={() => slide(1)} disabled={!canR} aria-label="Next"
            className="w-8 h-8 rounded-md border border-line bg-card text-body disabled:opacity-30 hover:text-gold hover:border-gold/50 transition-colors">›</button>
        </div>
      </div>
      <div ref={ref} onScroll={update}
        className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory"
        style={{ scrollbarWidth: 'thin' }}>
        {list.map((e, i) => (
          <Link key={e.id} href={`/events/${e.slug || e.id}`}
            style={{ animationDelay: `${Math.min(i * 50, 300)}ms` }}
            className="rise snap-start shrink-0 w-[260px] bg-ink border border-line rounded-lg p-5 no-underline hover:border-gold/60 transition-colors group flex flex-col">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.8px] text-gold">{fmtDay(e.date_start)}{e.date_end && e.date_end !== e.date_start ? ` → ${fmtDay(e.date_end)}` : ''}</span>
              {upcoming && <span className={badge(BADGE.goldfill)}>Upcoming</span>}
            </div>
            <div className="mt-2 font-extrabold text-[17px] leading-[1.2] text-white group-hover:text-gold line-clamp-2 min-h-[41px] transition-colors">{e.name}</div>
            <div className="mt-1 text-[12px] text-muted truncate">{e.venue || '—'}{e.region ? ` · ${e.region}` : ''}</div>
            {upcoming ? (
              <div className="mt-3 text-[12px] font-bold text-gold">VIEW DETAILS <span className="inline-block transition-transform group-hover:translate-x-1">→</span></div>
            ) : (
              <>
                <div className="mt-3 flex gap-5">
                  <span><span className="block text-[18px] font-extrabold leading-none tabular-nums text-white">{e.class_count ?? '–'}</span><span className="mt-1 block text-[10.5px] uppercase tracking-[0.6px] text-faint">classes</span></span>
                  <span><span className="block text-[18px] font-extrabold leading-none tabular-nums text-white">{e.combo_count ?? e.round_count ?? '–'}</span><span className="mt-1 block text-[10.5px] uppercase tracking-[0.6px] text-faint">combos</span></span>
                </div>
                {e.updated_at && <div className="mt-2 text-[11px] text-faint">Updated {fmtUpdated(e.updated_at)}</div>}
                <div className="mt-auto pt-3 text-[12px] font-bold text-gold">VIEW RESULTS <span className="inline-block transition-transform group-hover:translate-x-1">→</span></div>
              </>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
