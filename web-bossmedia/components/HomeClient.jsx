'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { EventCard, Filter, Icon, SiteFooter, SiteHeader } from './figma';
import ReelPlayer from './ReelPlayer';

export default function HomeClient({ items, heroImage, reels, regions, years, tiers }) {
  const [tab, setTab] = useState('Gallery live');
  const [view, setView] = useState('grid');
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('All regions');
  const [year, setYear] = useState('All years');
  const [tier, setTier] = useState('All tiers');
  const [limit, setLimit] = useState(6);
  const [activeReel, setActiveReel] = useState(null);

  useEffect(() => {
    document.body.style.overflow = activeReel !== null ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [activeReel]);

  const filtered = useMemo(() => items.filter((it) => {
    const tabMatch = tab === 'All events' || it.status === tab;
    const q = `${it.name} ${it.location}`.toLowerCase().includes(search.toLowerCase());
    const regionMatch = region === 'All regions' || it.region === region;
    const yearMatch = year === 'All years' || it.year === year;
    const tierMatch = tier === 'All tiers' || it.tier === tier;
    return tabMatch && q && regionMatch && yearMatch && tierMatch;
  }), [items, tab, search, region, year, tier]);

  useEffect(() => setLimit(6), [tab, search, region, year, tier]);

  return (
    <div className="site-shell">
      <SiteHeader transparent />
      <main id="top">
        <section className="hero section-gutter">
          <div className="hero-copy">
            <p className="eyebrow">New Zealand Equestrian</p>
            <h1>
              <span className="hero-lead">We don’t just capture performance.</span>
              <span className="hero-emphasis">We elevate it.</span>
            </h1>
            <p className="hero-intro">New Zealand’s Riders and Horses.<br />Elevated.</p>
            <div className="hero-links">
              <Link href="/pre-book" className="primary-link">Book your coverage <Icon name="arrow" size={17} /></Link>
              <Link href="/events" className="text-link">Explore our work</Link>
            </div>
          </div>
          <div className="hero-collage" aria-label="Featured equestrian photography">
            <figure className="hero-image hero-image-main">
              {heroImage ? <img src={heroImage} alt="Horse and rider moving through an equestrian event" loading="eager" fetchPriority="high" />
                : <span className="cover-fallback" aria-hidden="true">Boss Media</span>}
              <figcaption><span>01</span> Flight, captured</figcaption>
            </figure>
          </div>
        </section>

        <section className="events-section section-gutter" id="events">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Event archive</p>
              <h2>Find your event.</h2>
            </div>
          </div>
          <div className="event-tools">
            <div className="tabs" role="tablist" aria-label="Event status">
              {['Gallery live', 'Pre-book open', 'All events'].map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>
              ))}
            </div>
            <label className="search-box">
              <Icon name="search" />
              <span className="sr-only">Search event or location</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search event or location" />
            </label>
            <div className="filters">
              <Filter label="Region" value={region} onChange={setRegion} options={['All regions', ...regions]} />
              <Filter label="Year" value={year} onChange={setYear} options={['All years', ...years]} />
              <Filter label="Tier" value={tier} onChange={setTier} options={['All tiers', ...tiers]} />
            </div>
          </div>
          <div className="results-meta">
            <p>{filtered.length} {filtered.length === 1 ? 'event' : 'events'}</p>
            <div className="view-toggle" aria-label="View options">
              <button className={view === 'grid' ? 'active' : ''} aria-label="Grid view" onClick={() => setView('grid')}><Icon name="grid" /></button>
              <button className={view === 'list' ? 'active' : ''} aria-label="List view" onClick={() => setView('list')}><Icon name="list" /></button>
            </div>
          </div>
          {filtered.length > 0 ? (
            <>
              <div className={`event-results ${view}`}>
                {filtered.slice(0, limit).map((it) => <EventCard key={it.id} item={it} view={view} />)}
              </div>
              {limit < filtered.length && (
                <button className="load-more" onClick={() => setLimit((v) => v + 3)}>
                  Load more <span>({filtered.length - limit})</span>
                </button>
              )}
            </>
          ) : (
            <div className="empty-state">
              <p className="eyebrow">No results</p>
              <h3>That event isn’t here yet.</h3>
              <p>Try another search or clear the filters to see every event.</p>
              <button onClick={() => { setSearch(''); setRegion('All regions'); setYear('All years'); setTier('All tiers'); setTab('All events'); }}>
                Clear all filters
              </button>
            </div>
          )}
        </section>

        <section className="prebook-strip section-gutter" id="prebook">
          <div className="prebook-top">
            <p className="eyebrow light">Pre-book / Never miss the moment</p>
            <p className="prebook-status"><span />Bookings open</p>
          </div>
          <div className="prebook-row">
            <h2>Your next ride.<br />Already covered.</h2>
            <div className="prebook-aside">
              <p>Book a dedicated photographer before the event. We’ll follow your rounds and deliver a considered gallery of stills and reels.</p>
              <Link href="/pre-book">Explore upcoming events <Icon name="arrow" /></Link>
            </div>
          </div>
          <ol className="prebook-steps">
            <li><span>01</span><div><strong>Choose your event</strong><small>Browse open coverage dates</small></div></li>
            <li><span>02</span><div><strong>Reserve your rider</strong><small>Tell us your classes and times</small></div></li>
            <li><span>03</span><div><strong>Ride. We’ll capture it.</strong><small>Receive your private gallery</small></div></li>
          </ol>
        </section>

        <section className="reels-section section-gutter" id="reels">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Motion / Recent reels</p>
              <h2>See the whole ride.</h2>
            </div>
            <p className="reel-hint">Select a reel to watch</p>
          </div>
          <div className="reels-grid">
            {reels.map((reel, i) => (
              <button className="reel-card" key={reel.id} onClick={() => setActiveReel(i)} aria-label={`Play reel featuring ${reel.rider}`}>
                {reel.image ? <img src={reel.image} alt="" loading="lazy" /> : <span className="cover-fallback">Boss Media</span>}
                <span className="reel-number">0{i + 1}</span>
                <span className="play"><Icon name="play" size={22} /></span>
                <span className="reel-info"><strong>{reel.rider}</strong><small>{reel.event}</small></span>
              </button>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
      {activeReel !== null && reels[activeReel] && (
        <div className="reel-modal" role="dialog" aria-modal="true" aria-label={`Reel featuring ${reels[activeReel].rider}`} onClick={() => setActiveReel(null)}>
          <button className="modal-close" aria-label="Close reel" onClick={() => setActiveReel(null)}><Icon name="close" size={24} /></button>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            {reels[activeReel].video ? (
              <ReelPlayer src={reels[activeReel].video} poster={reels[activeReel].image}
                label={`Reel featuring ${reels[activeReel].rider}`} />
            ) : (
              <>
                {reels[activeReel].image && <img src={reels[activeReel].image} alt={`${reels[activeReel].rider} at ${reels[activeReel].event}`} />}
                <span className="modal-play"><Icon name="play" size={28} /></span>
              </>
            )}
            <div>
              <p>{reels[activeReel].rider}{reels[activeReel].horse ? ` × ${reels[activeReel].horse}` : ''}</p>
              <span>{reels[activeReel].event}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
