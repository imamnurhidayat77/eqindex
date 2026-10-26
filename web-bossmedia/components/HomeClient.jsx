'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { EventCard, Filter, Icon, SiteFooter, SiteHeader } from './figma';
import StoryViewer from './StoryViewer';

export default function HomeClient({ items, heroImage, reels, regions, years, tiers }) {
  const [tab, setTab] = useState('Gallery live');
  const [view, setView] = useState('grid');
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('All regions');
  const [year, setYear] = useState('All years');
  const [tier, setTier] = useState('All tiers');
  const [limit, setLimit] = useState(6);
  const [activeReel, setActiveReel] = useState(null);

  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    document.body.style.overflow = activeReel !== null ? 'hidden' : '';
    const onKey = (e) => { if (e.key === 'Escape') setActiveReel(null); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="site-shell">
      <SiteHeader transparent />
      <main id="top">
        <section className="hero section-gutter">
          <div className="hero-copy">
            <h1>
              <span className="hero-lead">We don’t just capture performance.</span>
              <span className="hero-emphasis">We elevate it.</span>
            </h1>
            <p className="hero-intro">New Zealand&rsquo;s riders and horses, captured at shows across the country.</p>
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
          {!scrolled && (
            <a href="#events" className="scroll-cue" aria-label="Scroll to events">
              <span>Scroll</span><i aria-hidden="true" />
            </a>
          )}
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
              {['Gallery live', 'All events'].map((t) => (
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

        <section className="booking-cta" aria-label="Pre-book your coverage">
          <div className="booking-cta-copy">
            <h2>Never miss your round.</h2>
            <p>Pre-book a dedicated photographer before you ride. Stills and reels from every round, delivered to your private gallery.</p>
            <Link href="/pre-book" className="booking-cta-btn">Book your coverage <Icon name="arrow" size={17} /></Link>
          </div>
          <ol className="booking-cta-steps">
            <li><span aria-hidden="true">01</span><div><strong>Choose your event</strong><small>Browse open coverage dates</small></div></li>
            <li><span aria-hidden="true">02</span><div><strong>Reserve your rider</strong><small>Tell us your classes and times</small></div></li>
            <li><span aria-hidden="true">03</span><div><strong>Ride. We’ll cover it.</strong><small>Stills and reels in your private gallery</small></div></li>
          </ol>
        </section>

        <section className="reels-section section-gutter" id="reels">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Motion / Recent reels</p>
              <h2>See the whole ride.</h2>
            </div>
            <div style={{ display: 'grid', gap: 10, justifyItems: 'end' }}>
              <p className="reel-hint">Select a reel to watch</p>
              <Link href="/reels" className="text-link">View all reels</Link>
            </div>
          </div>
          <div className="reels-grid">
            {reels.map((reel, i) => (
              <button className="reel-card" key={reel.id} onClick={() => setActiveReel(i)} aria-label={`Play reel featuring ${reel.rider}`}>
                {reel.image ? <img src={reel.image} alt="" loading="lazy" /> : <span className="cover-fallback">Boss Media</span>}
                <span className="play"><Icon name="play" size={22} /></span>
                <span className="reel-info"><strong>{reel.rider}</strong><small>{reel.event}</small></span>
              </button>
            ))}
          </div>
        </section>
        <section className="photo-cta section-gutter" id="join">
          <p className="eyebrow light">Contributors / Shoot for us</p>
          <div className="photo-cta-row">
            <h2>Shoot the show.<br />We’ll sell the shots.</h2>
            <div className="photo-cta-aside">
              <p>Join as a Boss Media photographer: upload once, we handle the shop, checkout and delivery — you keep shooting.</p>
              <div className="hero-links">
                <Link href="/register/photographer" className="primary-link">Apply as photographer <Icon name="arrow" size={17} /></Link>
                <Link href="/sell" className="text-link">How it works</Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
      {activeReel !== null && reels[activeReel] && (
        <StoryViewer reels={reels} index={activeReel} onIndex={setActiveReel} onClose={() => setActiveReel(null)} />
      )}
    </div>
  );
}
