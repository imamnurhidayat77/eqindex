'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { API } from '../../lib/api';
import { CARD, H1, SUB } from '../../lib/tokens';
import EventSearch from '../../components/EventSearch';
import { EventCardSk, PhotoCardSk } from '../../components/Skeletons';

const nzd = (c) => (c === null || c === undefined ? null : `NZ$${(Number(c) / 100).toFixed(2)}`);

function ImageIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M3 17l5-4 4 3 4-4 5 5" />
    </svg>
  );
}

function PlayIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" opacity="0.85" />
      <path d="M10 8.8v6.4L15.5 12z" fill="#0A0A0A" />
    </svg>
  );
}

const MOMENT = { win: 'Win', clear: 'Clear round', debut: 'Debut', pb: 'PB' };

export default function Photos() {
  return (
    <Suspense>
      <PhotosInner />
    </Suspense>
  );
}

function PhotosInner() {
  const [rows, setRows] = useState([]);
  const router = useRouter();
  const sp = useSearchParams();
  // ?kind= still honored for deep links (e.g. profile "Reels" strips),
  // but there is no visible kind switcher anymore.
  const kind = sp.get('kind') || '';
  const [loading, setLoading] = useState(true);
  const fHorse = sp.get('horse') || '';
  const urlRider = sp.get('rider') || '';
  const urlEvent = sp.get('event') || '';
  // URL-seeded subject filters stay (doorway links use ?horse= / ?rider=);
  // only the event search has a visible picker.
  const horseId = fHorse;
  const riderId = urlRider;
  const [events, setEvents] = useState([]);
  const [eventSel, setEventSel] = useState(undefined);
  useEffect(() => {
    fetch(`${API}/events?limit=200&include_empty=1`).then((r) => r.json())
      .then((j) => {
        const list = Array.isArray(j.data) ? j.data : [];
        setEvents(list);
        // Reflect a URL-seeded ?event= (id or slug) in the picker.
        if (urlEvent) {
          const hit = list.find((e) => String(e.id) === urlEvent || (e.slug && String(e.slug) === urlEvent));
          if (hit) setEventSel({ value: hit.id, label: hit.name, slug: hit.slug || null });
        }
      }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const eventId = eventSel === undefined ? urlEvent : (eventSel ? eventSel.value : '');

  // Event cards: the default gallery view. Newest event first, only events
  // with photos. Any subject/search/event filter switches to the flat
  // photo grid; the kind tab filters both views.
  const [evGroups, setEvGroups] = useState(null);
  useEffect(() => {
    (async () => {
      const p = new URLSearchParams();
      if (kind) p.set('kind', kind);
      try {
        const r = await fetch(`${API}/photos/events?${p}`);
        const j = await r.json().catch(() => ({}));
        if (r.ok && Array.isArray(j.data)) { setEvGroups(j.data); return; }
        if (r.ok) { setEvGroups([]); return; }
        // !ok (mis. 404: API lama belum punya endpoint) → fallback di bawah.
      } catch { /* jaringan gagal → coba fallback */ }
      // Fallback for APIs without /photos/events: group the flat catalog
      // client-side (capped at 200 latest — server endpoint stays the
      // source of truth once the API is deployed).
      try {
        const p2 = new URLSearchParams({ limit: '200' });
        if (kind) p2.set('kind', kind);
        const r2 = await fetch(`${API}/photos?${p2}`);
        const j2 = await r2.json().catch(() => ({}));
        const rows = Array.isArray(j2.data) ? j2.data : [];
        const map = new Map();
        for (const x of rows) {
          if (!x.event_id) continue;
          if (!map.has(x.event_id)) map.set(x.event_id, {
            event_id: x.event_id, event_name: x.event_name || 'Event', event_slug: null,
            date_start: null, photos: 0, reels: 0, thumb_url: null, preview_url: null, latest: '',
          });
          const g = map.get(x.event_id);
          g.photos += 1;
          if (x.kind === 'reel') g.reels += 1;
          if (!g.thumb_url && (x.thumb_url || x.preview_url)) {
            g.thumb_url = x.thumb_url || null;
            g.preview_url = x.preview_url || null;
          }
          const t = x.created_at || '';
          if (t && t > (g.latest || '')) {
            g.latest = t;
            if (x.taken_at && (!g.date_start || x.taken_at > g.date_start)) g.date_start = x.taken_at;
          }
        }
        setEvGroups([...map.values()].sort((a, b) =>
          String(b.date_start || b.latest || '').localeCompare(String(a.date_start || a.latest || ''))));
      } catch { setEvGroups([]); }
    })();
  }, [kind]);
  const browsingEvents = !horseId && !riderId && !eventId;
  const PAGE = 48;
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const photoParams = (off) => {
    const p = new URLSearchParams({ limit: String(PAGE), offset: String(off) });
    if (kind) p.set('kind', kind);
    if (horseId) p.set('horse_id', horseId);
    if (riderId) p.set('rider_id', riderId);
    if (eventId) p.set('event_id', eventId);
    return p;
  };
  useEffect(() => {
    setLoading(true);
    fetch(`${API}/photos?${photoParams(0)}`)
      .then((r) => r.json())
      .then((j) => {
        const list = Array.isArray(j.data) ? j.data : [];
        setRows(list);
        setOffset(list.length);
        setHasMore(list.length === PAGE);
      })
      .catch(() => { setRows([]); setHasMore(false); })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, horseId, riderId, eventId]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const r = await fetch(`${API}/photos?${photoParams(offset)}`);
      const j = await r.json().catch(() => ({}));
      const list = Array.isArray(j.data) ? j.data : [];
      setRows((prev) => [...prev, ...list.filter((x) => !prev.some((y) => y.id === x.id))]);
      setOffset((o) => o + list.length);
      setHasMore(list.length === PAGE);
    } catch { /* retryable */ }
    setLoadingMore(false);
  }

  // Picking an event navigates to its wall: /photos/<event-slug>.
  const goEvent = (o) => {
    if (!o) { setEventSel(null); return; }
    router.push(`/photos/${encodeURIComponent(o.slug || o.value)}`);
  };

  return (
    <>
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className={H1}>Photos</h1>
        {browsingEvents
          ? (evGroups !== null && !!evGroups.length && (
            <span className="rounded-full border border-line px-2.5 py-1 text-[12px] font-bold text-muted">
              {evGroups.length} event{evGroups.length > 1 ? 's' : ''}
            </span>
          ))
          : (!loading && !!rows.length && (
            <span className="rounded-full border border-line px-2.5 py-1 text-[12px] font-bold text-muted">
              {rows.length} photo{rows.length > 1 ? 's' : ''}
            </span>
          ))}
        <span className="flex-1" />
        <Link href="/media" className="text-sky text-[13px] no-underline hover:underline">My media →</Link>
      </div>
      <p className={SUB}>Buy event photos — watermarked previews, full resolution after purchase.</p>

      <div className="mb-4 max-w-[560px]">
        <EventSearch events={events}
          value={eventSel === undefined ? (urlEvent ? { value: urlEvent, label: urlEvent } : null) : eventSel}
          onPick={goEvent} placeholder="Search event…" />
      </div>

      {browsingEvents ? (
        evGroups === null ? (
          <EventCardSk n={6} />
        ) : evGroups.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {evGroups.map((g, i) => (
              <Link key={g.event_id} href={`/photos/${encodeURIComponent(g.event_slug || g.event_id)}`}
                style={{ animationDelay: `${Math.min(i * 40, 240)}ms` }}
                aria-label={`${g.event_name} — ${g.photos} photos`}
                className="rise group flex flex-col rounded-lg border border-line bg-card overflow-hidden no-underline hover:border-gold/50 transition">
                <div className="relative aspect-[16/9] bg-card2 flex items-center justify-center overflow-hidden">
                  {g.thumb_url || g.preview_url
                    ? <img src={g.thumb_url || g.preview_url} alt={`Cover photo from ${g.event_name}`} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-[1.03] transition duration-300" />
                    : <ImageIcon className="h-8 w-8 text-faint" />}
                </div>
                <div className="flex grow flex-col gap-0.5 p-3">
                  <div className="text-[14px] font-bold text-white truncate group-hover:text-gold transition">{g.event_name}</div>
                  <div className="text-[11.5px] text-faint">{(g.date_start || '').slice(0, 10) || ''}</div>
                  <div className="mt-auto flex items-center justify-between pt-1">
                    <span className="text-[12px] text-muted">
                      {g.photos} photo{g.photos === 1 ? '' : 's'}{Number(g.reels) > 0 ? ` · ${g.reels} reel${Number(g.reels) === 1 ? '' : 's'}` : ''}
                    </span>
                    <span className="text-sky text-[12px] font-bold">Shop →</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <section className={CARD}>
            <div className="flex flex-col items-center py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-card2 text-faint">
                <ImageIcon className="h-6 w-6" />
              </span>
              <h2 className="mt-3 text-[16px] font-bold text-white">No photos found</h2>
              <p className="mt-1 text-[13px] text-muted">Try a different search or filter — new event photos land here after publishing.</p>
            </div>
          </section>
        )
      ) : loading ? (
        <PhotoCardSk n={8} />
      ) : rows.length ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {rows.map((x, i) => {
            const price = nzd(x.price_cents);
            return (
              <Link key={x.id} href={`/photos/${x.id}`} style={{ animationDelay: `${Math.min(i * 30, 240)}ms` }} aria-label={[x.horse, x.rider].filter(Boolean).join(' × ') || x.event_name || 'Photo'} className="rise group flex flex-col rounded-lg border border-line bg-card overflow-hidden no-underline hover:border-gold/50 transition">
                <div className="relative aspect-[4/3] bg-card2 flex items-center justify-center overflow-hidden">
                  {x.thumb_url || x.preview_url
                    ? <img src={x.thumb_url || x.preview_url} alt={[x.horse, x.rider].filter(Boolean).join(' × ') || `${x.event_name || 'Show-jumping'} photo`} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-[1.03] transition duration-300" />
                    : <ImageIcon className="h-8 w-8 text-faint" />}
                  {x.kind === 'reel' && (
                    <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white">
                      <PlayIcon className="h-3.5 w-3.5 text-gold" /> Reel
                    </span>
                  )}
                  {x.moment && MOMENT[x.moment] && (
                    <span className="absolute right-2 top-2 rounded-full bg-goldbg/80 px-2 py-0.5 text-[10.5px] font-bold text-gold">
                      {MOMENT[x.moment]}
                    </span>
                  )}
                </div>
                <div className="flex grow flex-col gap-0.5 p-2.5">
                  <div className="text-[13px] font-bold text-white truncate group-hover:text-gold transition">
                    {[x.horse, x.rider].filter(Boolean).join(' × ') || x.event_name || 'Untagged'}
                  </div>
                  <div className="text-[11px] text-faint truncate">{x.event_name || ''}</div>
                  <div className="mt-auto flex items-center justify-between pt-1">
                    <span className="text-[11px] text-faint">{x.kind === 'reel' ? 'Video' : 'Photo'}</span>
                    {price && <span className="text-[12px] font-bold text-gold tabular-nums">from {price}</span>}
                  </div>
                </div>
              </Link>
            );
          })}
          </div>
          {hasMore && (
            <div className="mt-4 text-center">
              <button onClick={loadMore} disabled={loadingMore}
                className="rounded-md border border-line bg-card2 px-5 py-2.5 text-[13px] font-bold text-white hover:border-gold/50 hover:text-gold cursor-pointer disabled:opacity-60">
                {loadingMore ? 'Loading…' : `Load more (${rows.length} shown)`}
              </button>
            </div>
          )}
        </>
      ) : (
        <section className={CARD}>
          <div className="flex flex-col items-center py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-card2 text-faint">
              <ImageIcon className="h-6 w-6" />
            </span>
            <h2 className="mt-3 text-[16px] font-bold text-white">No photos found</h2>
            <p className="mt-1 text-[13px] text-muted">Try a different search or filter — new event photos land here after publishing.</p>
          </div>
        </section>
      )}
    </>
  );
}
