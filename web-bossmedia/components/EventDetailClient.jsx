'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Icon, SiteFooter, SiteHeader } from './figma';
import SmartImage from './SmartImage';
import MomentsStrip from './MomentsStrip';
import FollowButton from './FollowButton';
import SaveButton from './SaveButton';
import SearchSelect from './SearchSelect';
import { API } from '../lib/api';
import { uniqueById } from '../lib/unique-by-id.mjs';
import d from './EventDetail.module.css';

export const GALLERY_PAGE_SIZE = 48;
const SEARCH_DEBOUNCE_MS = 300;
const KIND_PARAM = { Photo: 'photo', Reel: 'reel' };

const MOMENT_LABELS = { win: 'Win', pb: 'Personal best', clear: 'Clear round', debut: 'Debut' };
const momentLabel = (m) => MOMENT_LABELS[m] || m;

// Search, filters and paging run on the server (/photos with a keyset
// cursor), so every photo of a big event is reachable. Filter options and
// tab counts come from /photos/facets, not from the loaded page.
export default function EventDetailClient({ event, initial, facets }) {
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [rider, setRider] = useState('');
  const [horse, setHorse] = useState('');
  const [moment, setMoment] = useState('');
  const [items, setItems] = useState(initial?.data || []);
  const [nextCursor, setNextCursor] = useState(initial?.next_cursor || null);
  const [loading, setLoading] = useState(false);

  const riders = [...(facets?.riders || [])].sort((a, b) => a.name.localeCompare(b.name));
  const horses = [...(facets?.horses || [])].sort((a, b) => a.name.localeCompare(b.name));
  const moments = [...(facets?.moments || [])].sort();
  const photoCount = facets?.photos ?? items.filter((m) => m.kind !== 'reel').length;
  const reelCount = facets?.reels ?? items.filter((m) => m.kind === 'reel').length;

  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const p = new URLSearchParams({ event_id: event.id, limit: String(GALLERY_PAGE_SIZE) });
  if (term) p.set('q', term);
  if (KIND_PARAM[filter]) p.set('kind', KIND_PARAM[filter]);
  if (rider) p.set('rider_id', rider);
  if (horse) p.set('horse_id', horse);
  if (moment) p.set('moment', moment);
  const query = p.toString();
  const queryRef = useRef(query);
  const firstQuery = useRef(query);
  queryRef.current = query;

  // Refetch page 1 when filters change; the server already sent the default view.
  useEffect(() => {
    if (query === firstQuery.current) { firstQuery.current = null; return; }
    let live = true;
    setLoading(true);
    fetch(`${API}/photos?${query}`).then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => {
      if (!live) return;
      setItems(j.data || []); setNextCursor(j.next_cursor || null);
    }).catch(() => {}).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [query]);

  async function loadMore() {
    if (!nextCursor || loading) return;
    const asked = query;
    setLoading(true);
    try {
      const r = await fetch(`${API}/photos?${asked}&cursor=${encodeURIComponent(nextCursor)}`);
      const j = r.ok ? await r.json() : null;
      if (!j || queryRef.current !== asked) return; // filters changed mid-request
      setItems((xs) => uniqueById([...xs, ...(j.data || [])]));
      setNextCursor(j.next_cursor || null);
    } finally { setLoading(false); }
  }

  const clearAll = () => { setSearch(''); setTerm(''); setRider(''); setHorse(''); setMoment(''); setFilter('All'); };

  return (
    <div className="event-detail-page">
      <SiteHeader />
      <main>
        <section className="event-media-section section-gutter" data-page-top>
          <div className="event-media-header">
            <div>
              <Link href="/events" className="event-collection-back">← Event galleries</Link>
              <p className="eyebrow">Photos &amp; reels{event.year ? ` / ${event.year}` : ''}</p>
              <h1 className={d.title}>{event.name}</h1>
            </div>
            <p>Select an image to preview. High-resolution downloads are available after purchase.</p>
            <p style={{ marginTop: 10 }}>
              <FollowButton kind="event" id={event.id} name={event.name} />
              <span style={{ color: '#666', fontSize: 12, marginLeft: 8 }}>Get notified as new photos and moments drop.</span>
            </p>
          </div>
          <div className="event-gallery-search">
            <label className="detail-media-search">
              <Icon name="search" />
              <span className="sr-only">Search rider, horse or media</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search rider, horse or media" />
            </label>
            <label className="detail-media-filter">
              <span>Rider</span>
              <SearchSelect options={[{ id: '', label: 'All riders' }, ...riders.map((r) => ({ id: r.id, label: r.name }))]} value={rider}
                onChange={(id) => setRider(id || '')} placeholder="Rider" clearable={false} />
            </label>
            <label className="detail-media-filter">
              <span>Horse</span>
              <SearchSelect options={[{ id: '', label: 'All horses' }, ...horses.map((h) => ({ id: h.id, label: h.name }))]} value={horse}
                onChange={(id) => setHorse(id || '')} placeholder="Horse" clearable={false} />
            </label>
            {moments.length > 0 && (
              <label className="detail-media-filter">
                <span>Moment</span>
                <SearchSelect options={[{ id: '', label: 'All moments' }, ...moments.map((m) => ({ id: m, label: momentLabel(m) }))]} value={moment}
                  onChange={(id) => setMoment(id || '')} placeholder="Moment" clearable={false} />
              </label>
            )}
          </div>
          <div className="event-media-tools">
            <div className="media-tabs" role="group" aria-label="Media type">
              {[['All', photoCount + reelCount], ['Photo', photoCount], ['Reel', reelCount]].map(([t, n]) => (
                <button key={t} aria-pressed={filter === t} className={filter === t ? 'active' : ''} onClick={() => setFilter(t)}>
                  {t}<span>{n}</span>
                </button>
              ))}
            </div>
            <p aria-live="polite">{loading && !items.length ? 'Loading…' : `${items.length}${nextCursor ? '+' : ''} items`}</p>
          </div>
          {items.length ? (
            <div className="event-media-grid">
              {items.map((m) => {
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
              <button onClick={clearAll}>
                Clear all filters
              </button>
            </div>
          )}
          {nextCursor && (
            <button type="button" className={`load-more ${d.loadMore}`} onClick={loadMore} disabled={loading} aria-busy={loading}>
              {loading ? 'Loading…' : 'Load more'}
            </button>
          )}
        </section>
        <MomentsStrip eventId={event.id} />
      </main>
      <SiteFooter />
    </div>
  );
}
