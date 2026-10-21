'use client';
import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { API } from '../../lib/api';
import { CARD, H1, SUB } from '../../lib/tokens';
import RiderPicker from '../../components/RiderPicker';
import HorsePicker from '../../components/HorsePicker';
import Dropdown from '../../components/Dropdown';

const TABS = [['', 'All'], ['photo', 'Photos'], ['reel', 'Reels']];
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
  const sp = useSearchParams();
  const [kind, setKind] = useState(sp.get('kind') || '');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const fHorse = sp.get('horse') || '';
  const urlRider = sp.get('rider') || '';
  const urlEvent = sp.get('event') || '';
  const [horseSel, setHorseSel] = useState(undefined);
  const [urlHorseName, setUrlHorseName] = useState('');
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
          if (hit) setEventSel({ value: hit.id, label: hit.name });
        }
      }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!fHorse) return;
    fetch(`${API}/horses/${encodeURIComponent(fHorse)}`).then((r) => r.json()).then((j) => {
      const d = j.data || {};
      if (d && (d.id || d.horse_id)) setUrlHorseName(d.name || '');
    }).catch(() => {});
  }, [fHorse]);
  const horseId = horseSel === undefined ? fHorse : (horseSel ? horseSel.id : '');
  const horseValue = horseSel === undefined
    ? (fHorse ? { id: fHorse, name: urlHorseName || fHorse } : null)
    : horseSel;
  const eventId = eventSel === undefined ? urlEvent : (eventSel ? eventSel.value : '');
  // Rider filter: URL (?rider=) seeds it; the searchable picker overrides it
  // server-side (the text box below stays as a client-side refinement).
  // undefined = follow URL, null = cleared, {id,name} = picked.
  const [riderSel, setRiderSel] = useState(undefined);
  const [urlRiderName, setUrlRiderName] = useState('');
  useEffect(() => {
    if (!urlRider) return;
    fetch(`${API}/riders/${encodeURIComponent(urlRider)}`).then((r) => r.json()).then((j) => {
      const d = j.data || {};
      if (d && (d.id || d.rider_id)) setUrlRiderName(d.name || '');
    }).catch(() => {});
  }, [urlRider]);
  const riderId = riderSel === undefined ? urlRider : (riderSel ? riderSel.id : '');
  const riderValue = riderSel === undefined
    ? (urlRider ? { id: urlRider, name: urlRiderName || urlRider } : null)
    : riderSel;
  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ limit: '96' });
    if (kind) p.set('kind', kind);
    if (horseId) p.set('horse_id', horseId);
    if (riderId) p.set('rider_id', riderId);
    if (eventId) p.set('event_id', eventId);
    fetch(`${API}/photos?${p}`)
      .then((r) => r.json())
      .then((j) => setRows(j.data || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [kind, horseId, riderId, eventId]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((x) =>
      [x.horse, x.rider, x.event_name].filter(Boolean).some((v) => v.toLowerCase().includes(s)));
  }, [rows, q]);

  return (
    <>
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className={H1}>Photos</h1>
        {!loading && !!filtered.length && (
          <span className="rounded-full border border-line px-2.5 py-1 text-[12px] font-bold text-muted">
            {filtered.length} photo{filtered.length > 1 ? 's' : ''}
          </span>
        )}
        <span className="flex-1" />
        <Link href="/media" className="text-sky text-[13px] no-underline hover:underline">My media →</Link>
      </div>
      <p className={SUB}>Buy event photos — watermarked previews, full resolution after purchase.</p>

      <section className={`${CARD} !p-3 mb-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 bg-card2 border border-line rounded p-1 overflow-x-auto w-fit" role="tablist" aria-label="Media type">
            {TABS.map(([k, lbl]) => (
              <button key={k} role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
                className={`px-3.5 py-[7px] rounded-md text-[13px] whitespace-nowrap cursor-pointer border-0 ${kind === k ? 'bg-card text-gold font-bold' : 'bg-transparent text-muted hover:text-white'}`}>
                {lbl}
              </button>
            ))}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Horse, rider, event…" aria-label="Search photos"
            className="rounded border border-line bg-ink px-2.5 py-2 text-[13px] text-white placeholder:text-faint focus:border-gold/60 focus:outline-none grow min-w-[180px]" />
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <Dropdown ariaLabel="Filter by event" searchable placeholder="All events…"
            value={eventSel === undefined ? '' : (eventSel ? eventSel.value : '')}
            options={[{ value: '', label: 'All events…' },
              ...events.map((e) => ({ value: e.id, label: `${e.name}${e.date_start ? ` · ${String(e.date_start).slice(0, 10)}` : ''}` }))]}
            onSelect={(o) => setEventSel(o.value ? o : null)} />
          <HorsePicker value={horseValue} onPick={setHorseSel} placeholder="Filter by horse…" />
          <RiderPicker value={riderValue} onPick={setRiderSel} placeholder="Filter by rider…" />
        </div>
      </section>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <span key={i} className="sk h-44 w-full rounded-xl" />)}
        </div>
      ) : filtered.length ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {filtered.map((x) => {
            const price = nzd(x.price_cents);
            return (
              <Link key={x.id} href={`/photos/${x.id}`} className="group flex flex-col rounded-xl border border-line bg-card overflow-hidden no-underline hover:border-gold/50 transition">
                <div className="relative aspect-[4/3] bg-card2 flex items-center justify-center overflow-hidden">
                  {x.thumb_url || x.preview_url
                    ? <img src={x.thumb_url || x.preview_url} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.03] transition duration-300" />
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
