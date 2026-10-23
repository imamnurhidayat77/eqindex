'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Icon, SiteFooter, SiteHeader } from './figma';
import GalleryPager from './GalleryPager';

const LIMIT = 12;

export default function ReelsClient({ items, eventOptions }) {
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('All events');
  const [page, setPage] = useState(1);

  const visible = useMemo(() => items.filter((r) => {
    const q = `${r.rider} ${r.horse} ${r.event}`.toLowerCase();
    return q.includes(search.toLowerCase()) && (eventFilter === 'All events' || r.event === eventFilter);
  }), [items, search, eventFilter]);
  const pages = Math.max(1, Math.ceil(visible.length / LIMIT));
  const safePage = Math.min(page, pages);
  const pageItems = visible.slice((safePage - 1) * LIMIT, safePage * LIMIT);

  return (
    <div className="reels-page">
      <SiteHeader />
      <main className="reels-archive section-gutter" data-page-top>
        <div className="reels-page-heading">
          <div>
            <p className="eyebrow">Boss Media / Motion</p>
            <h1>Reels.</h1>
          </div>
          <p>Short-form equestrian stories, captured around New Zealand and edited for riders who want to relive the whole round.</p>
        </div>
        <div className="reels-page-tools">
          <label>
            <Icon name="search" />
            <span className="sr-only">Search rider or event</span>
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search rider or event" />
          </label>
          <label>
            <span>Event</span>
            <select value={eventFilter} onChange={(e) => { setEventFilter(e.target.value); setPage(1); }}>
              <option>All events</option>
              {eventOptions.map((ev) => <option key={ev}>{ev}</option>)}
            </select>
            <Icon name="chevron" size={16} />
          </label>
        </div>
        <div className="reels-result-meta">
          <p>{visible.length} reels</p>
          <p>Recent first</p>
        </div>
        {visible.length ? (
          <>
          <div className="reels-archive-grid">
            {pageItems.map((r, i) => {
              const href = r.eventSlug ? `/events/${r.eventSlug}/media/${r.id}?rider=${encodeURIComponent(r.rider)}&horse=${encodeURIComponent(r.horse)}` : `/p/${r.id}`;
              return (
                <Link key={r.id} href={href} aria-label={`Play ${r.rider} at ${r.event}`}>
                  {r.image ? <img src={r.image} alt="" loading="lazy" /> : <span className="cover-fallback">Boss Media</span>}
                  <span className="archive-reel-index">{String((safePage - 1) * LIMIT + i + 1).padStart(2, '0')}</span>
                  <span className="archive-reel-duration">{r.horse ? r.horse.slice(0, 12) : ''}</span>
                  <span className="archive-reel-play"><Icon name="play" size={22} /></span>
                  <span className="archive-reel-info"><strong>{r.rider}</strong><small>{r.event}</small></span>
                </Link>
              );
            })}
          </div>
          <GalleryPager page={safePage} pages={pages} onPage={setPage} />
          </>
        ) : (
          <div className="event-media-empty">
            <p className="eyebrow">No reels found</p>
            <h3>Try another rider or event.</h3>
            <button onClick={() => { setSearch(''); setEventFilter('All events'); setPage(1); }}>Clear filters</button>
          </div>
        )}
        <section className="reels-booking-cta">
          <div>
            <p className="eyebrow">Your next ride</p>
            <h2>Made to move.</h2>
          </div>
          <p>Pre-book a dedicated reel and let our team follow your full round.</p>
          <Link href="/pre-book">Book reel coverage <Icon name="arrow" size={18} /></Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
