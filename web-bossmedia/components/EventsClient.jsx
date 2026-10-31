'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { EventCard, Filter, Icon, SiteFooter, SiteHeader, preloadEventCovers } from './figma';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function EventsClient({ items, regions, years }) {
  const [view, setView] = useState('grid');
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('All regions');
  const [year, setYear] = useState('All years');
  const [limit, setLimit] = useState(9);

  const filtered = useMemo(() => items.filter((it) => {
    if (it.status !== 'Gallery live') return false;
    const q = `${it.name} ${it.location}`.toLowerCase().includes(search.toLowerCase());
    const regionMatch = region === 'All regions' || it.region === region;
    const yearMatch = year === 'All years' || it.year === year;
    return q && regionMatch && yearMatch;
  }), [items, search, region, year]);

  useEffect(() => setLimit(9), [search, region, year]);

  useEffect(() => {
    // Hangatkan cover fallback (N+1) untuk kartu tanpa cover bawaan server.
    preloadEventCovers(items.map((it) => (it.cover ? null : it.id)));
  }, [items]);

  const clearFilters = () => {
    setSearch(''); setRegion('All regions'); setYear('All years');
  };

  return (
    <div className="gallery-page">
      <SiteHeader />
      <main>
        <section className="events-section gallery-browser section-gutter" id="gallery-results">
          <div className="gallery-browser-heading">
            <div>
              <p className="eyebrow">Past events / New Zealand</p>
              <h1>Event galleries.</h1>
            </div>
            <p>Completed events only · Find your photos and reels</p>
          </div>
          <div className="gallery-simple-tools">
            <label className="search-box">
              <Icon name="search" />
              <span className="sr-only">Search event or location</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search event or location" />
            </label>
            <div className="filters">
              <Filter label="Region" value={region} onChange={setRegion} options={['All regions', ...regions]} />
              <Filter label="Year" value={year} onChange={setYear} options={['All years', ...years]} />
            </div>
          </div>
          <div className="results-meta">
            <p role="status" aria-live="polite">{filtered.length} {filtered.length === 1 ? 'event' : 'events'}</p>
            <div className="view-toggle" role="group" aria-label="View options">
              <button className={view === 'grid' ? 'active' : ''} aria-label="Grid view" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><Icon name="grid" /></button>
              <button className={view === 'list' ? 'active' : ''} aria-label="List view" aria-pressed={view === 'list'} onClick={() => setView('list')}><Icon name="list" /></button>
              <button className={view === 'calendar' ? 'active' : ''} aria-label="Calendar view" aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}><Icon name="calendar" /></button>
            </div>
          </div>
          {filtered.length ? (
            <>
              {view === 'calendar' ? (
                <CalendarView events={filtered} />
              ) : (
                <div className={`event-results ${view}`}>
                  {filtered.slice(0, limit).map((it) => <EventCard key={it.id} item={it} view={view} />)}
                </div>
              )}
              {view !== 'calendar' && limit < filtered.length && (
                <button className="load-more" onClick={() => setLimit((v) => v + 9)}>
                  Load more <span>({filtered.length - limit})</span>
                </button>
              )}
            </>
          ) : (
            <div className="empty-state">
              <p className="eyebrow">No results</p>
              <h3>That event isn’t here yet.</h3>
              <p>Try another search or clear the filters to see every event.</p>
              <button onClick={clearFilters}>Clear all filters</button>
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function CalendarView({ events }) {
  const withDates = events.filter((e) => e.dateStart);
  const first = withDates[0];
  const firstDate = first ? new Date(first.dateStart) : new Date();
  const [cursor, setCursor] = useState({
    month: Number.isNaN(firstDate.getTime()) ? new Date().getMonth() : firstDate.getMonth(),
    year: Number.isNaN(firstDate.getTime()) ? new Date().getFullYear() : firstDate.getFullYear(),
  });

  useEffect(() => {
    if (!first) return;
    const d = new Date(first.dateStart);
    if (!Number.isNaN(d.getTime())) setCursor({ month: d.getMonth(), year: d.getFullYear() });
  }, [events, first?.dateStart]);

  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const firstDayOffset = (new Date(cursor.year, cursor.month, 1).getDay() + 6) % 7;
  const cellCount = Math.ceil((firstDayOffset + daysInMonth) / 7) * 7;
  // Day → events map so render doesn't re-scan every event per cell.
  const byDay = useMemo(() => {
    const m = new Map();
    for (const e of withDates) {
      const s = (e.dateStart || '').slice(0, 10);
      const en = (e.dateEnd || e.dateStart || '').slice(0, 10);
      if (!s) continue;
      const d0 = new Date(`${s}T00:00`);
      const d1 = new Date(`${en || s}T00:00`);
      if (Number.isNaN(d0.getTime())) continue;
      for (let t = new Date(d0); t <= d1; t.setDate(t.getDate() + 1)) {
        const k = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(e);
      }
    }
    return m;
  }, [withDates]);

  const moveMonth = (dir) => {
    const n = new Date(cursor.year, cursor.month + dir, 1);
    setCursor({ month: n.getMonth(), year: n.getFullYear() });
  };

  const dayKey = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  return (
    <div className="calendar-results">
      <div className="calendar-header">
        <div>
          <p className="eyebrow">Event calendar</p>
          <h3>{MONTH_NAMES[cursor.month]} <span>{cursor.year}</span></h3>
        </div>
        <div>
          <button aria-label="Previous month" onClick={() => moveMonth(-1)}>←</button>
          <button aria-label="Next month" onClick={() => moveMonth(1)}>→</button>
        </div>
      </div>
      <div className="calendar-grid-scroll" tabIndex={0} role="region" aria-label="Event calendar — scroll sideways to see the whole month">
        <p className="calendar-scroll-hint" aria-hidden="true">← Scroll sideways for the whole month →</p>
        <div className="calendar-grid">
          {WEEK_DAYS.map((d) => <div className="calendar-weekday" key={d}>{d}</div>)}
          {Array.from({ length: cellCount }, (_, i) => {
            const day = i - firstDayOffset + 1;
            const inMonth = day > 0 && day <= daysInMonth;
            const key = inMonth ? dayKey(cursor.year, cursor.month, day) : null;
            const dayEvents = inMonth ? (byDay.get(key) || []) : [];
            return (
              <div className={`calendar-cell ${inMonth ? '' : 'outside'}`} key={`${cursor.year}-${cursor.month}-${i}`}>
                {inMonth && <span className="calendar-day">{day}</span>}
                {dayEvents.map((e) => (
                  <Link className="calendar-event-chip" href={`/events/${e.slug}`} key={e.id}>
                    <strong>{e.name}</strong>
                    <small>{e.location}</small>
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div className="calendar-legend">
        <span><i /> Gallery available</span>
        <p>{withDates.length} completed events in current results</p>
      </div>
    </div>
  );
}
