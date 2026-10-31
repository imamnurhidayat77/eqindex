'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Icon, SiteFooter, SiteHeader } from './figma';
import SmartImage from './SmartImage';
import GalleryPager from './GalleryPager';
import SaveButton from './SaveButton';
import SearchSelect from './SearchSelect';

const LIMIT = 24;

const MOMENT_LABELS = { win: 'Win', pb: 'Personal best', clear: 'Clear round', debut: 'Debut' };
const momentLabel = (m) => MOMENT_LABELS[m] || m;

export default function EventDetailClient({ event, media }) {
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [rider, setRider] = useState('All riders');
  const [horse, setHorse] = useState('All horses');
  const [moment, setMoment] = useState('All moments');
  const [page, setPage] = useState(1);

  const riders = useMemo(() => [...new Set(media.map((m) => m.rider).filter(Boolean))].sort(), [media]);
  const horses = useMemo(() => [...new Set(media.map((m) => m.horse).filter(Boolean))].sort(), [media]);
  const moments = useMemo(() => [...new Set(media.map((m) => m.moment).filter(Boolean))].sort(), [media]);

  const visible = useMemo(() => media.filter((m) => {
    const kind = m.kind === 'reel' ? 'Reel' : 'Photo';
    const q = `${m.rider || ''} ${m.horse || ''} ${m.class_name || ''} ${m.event_name || ''}`.toLowerCase();
    return q.includes(search.toLowerCase())
      && (filter === 'All' || kind === filter)
      && (rider === 'All riders' || m.rider === rider)
      && (horse === 'All horses' || m.horse === horse)
      && (moment === 'All moments' || m.moment === moment);
  }), [media, filter, search, rider, horse, moment]);
  const pages = Math.max(1, Math.ceil(visible.length / LIMIT));
  const safePage = Math.min(page, pages);
  const pageItems = visible.slice((safePage - 1) * LIMIT, safePage * LIMIT);

  const photoCount = media.filter((m) => m.kind !== 'reel').length;
  const reelCount = media.filter((m) => m.kind === 'reel').length;

  return (
    <div className="event-detail-page">
      <SiteHeader />
      <main>
        <section className="event-media-section section-gutter" data-page-top>
          <div className="event-media-header">
            <div>
              <Link href="/events" className="event-collection-back">← Event galleries</Link>
              <p className="eyebrow">{event.name} / {event.year}</p>
              <h2>Photos &amp; reels.</h2>
            </div>
            <p>Select an image to preview. High-resolution downloads are available after purchase.</p>
          </div>
          <div className="event-gallery-search">
            <label className="detail-media-search">
              <Icon name="search" />
              <span className="sr-only">Search rider, horse or media</span>
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search rider, horse or media" />
            </label>
            <label className="detail-media-filter">
              <span>Rider</span>
              <SearchSelect options={['All riders', ...riders].map((r) => ({ id: r, label: r }))} value={rider}
                onChange={(id) => { setRider(id); setPage(1); }} placeholder="Rider" clearable={false} />
            </label>
            <label className="detail-media-filter">
              <span>Horse</span>
              <SearchSelect options={['All horses', ...horses].map((h) => ({ id: h, label: h }))} value={horse}
                onChange={(id) => { setHorse(id); setPage(1); }} placeholder="Horse" clearable={false} />
            </label>
            {moments.length > 0 && (
              <label className="detail-media-filter">
                <span>Moment</span>
                <SearchSelect options={['All moments', ...moments].map((m) => ({ id: m, label: momentLabel(m) }))} value={moment}
                  onChange={(id) => { setMoment(id); setPage(1); }} placeholder="Moment" clearable={false} />
              </label>
            )}
          </div>
          <div className="event-media-tools">
            <div className="media-tabs" role="group" aria-label="Media type">
              {[['All', media.length], ['Photo', photoCount], ['Reel', reelCount]].map(([t, n]) => (
                <button key={t} aria-pressed={filter === t} className={filter === t ? 'active' : ''} onClick={() => { setFilter(t); setPage(1); }}>
                  {t}<span>{n}</span>
                </button>
              ))}
            </div>
            <p>{visible.length} items</p>
          </div>
          {visible.length ? (
            <div className="event-media-grid">
              {pageItems.map((m) => {
                const isReel = m.kind === 'reel';
                return (
                  <article className={`event-media-card ${isReel ? 'reel' : 'photo'}`} key={m.id}>
                  <Link style={{ display: 'block' }}
                    href={`/events/${event.slug}/media/${m.id}`} aria-label={`Preview ${m.horse || ''} ${m.rider || ''}`}>
                    <SmartImage src={m.thumb_url || m.preview_url} alt={[m.horse, m.rider].filter(Boolean).join(' and ') || `${m.event_name || 'Show-jumping'} photo`} width={800} height={600} sizes="(max-width: 768px) 100vw, 50vw" />
                    <span className="media-kind">{isReel && <Icon name="play" size={13} />}{isReel ? 'Reel' : 'Photo'}</span>
                    <span className="media-card-footer">
                      <small title={m.class_name || m.event_name || ''}>{m.class_name || m.event_name || '—'}</small>
                      <span className="media-card-title">
                        <strong>{[m.rider, m.horse].filter(Boolean).join(' · ') || m.other_people || m.event_name || 'Untitled'}</strong>
                        <Icon name="arrow" size={15} />
                      </span>
                    </span>
                  </Link>
                  <SaveButton id={m.id} />
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="event-media-empty">
              <p className="eyebrow">No media found</p>
              <h3>Try another rider or horse.</h3>
              <button onClick={() => { setSearch(''); setRider('All riders'); setHorse('All horses'); setMoment('All moments'); setFilter('All'); setPage(1); }}>
                Clear all filters
              </button>
            </div>
          )}
          <GalleryPager page={safePage} pages={pages} onPage={setPage} />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
