'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { API } from '../lib/api';
import Dropdown from './Dropdown';
import { CARD } from '../lib/tokens';

const PAGE = 48;
const MOMENT = {
  win: '🏆 Win', clear: '✨ Clear round', debut: '🌟 Debut', pb: '⚡ PB',
};

// Event photo wall grid: paged loading (48 at a time) so big events stay
// fast. Horse/rider filters run server-side (correct across pages); the
// text search runs over loaded rows and silently pulls the rest so it
// searches the whole event, not just the first page.
export default function EventWallGrid({ initialRows = [], eventId, kind }) {
  const [rows, setRows] = useState(initialRows);
  const [offset, setOffset] = useState(initialRows.length);
  const [hasMore, setHasMore] = useState(initialRows.length === PAGE);
  const [busy, setBusy] = useState(false);
  const [horse, setHorse] = useState('');
  const [rider, setRider] = useState('');
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [fetchingAll, setFetchingAll] = useState(false);

  const paramsOf = (off, h, r) => {
    const p = new URLSearchParams({ event_id: eventId, limit: String(PAGE), offset: String(off) });
    if (kind) p.set('kind', kind);
    if (h) p.set('horse_id', h);
    if (r) p.set('rider_id', r);
    return p;
  };
  const getPage = async (off, h, r) => {
    const res = await fetch(`${API}/photos?${paramsOf(off, h, r)}`);
    const j = await res.json().catch(() => ({}));
    return Array.isArray(j.data) ? j.data : [];
  };

  async function refetch(h, r) {
    setBusy(true);
    try {
      const list = await getPage(0, h, r);
      setRows(list);
      setOffset(list.length);
      setHasMore(list.length === PAGE);
    } catch { /* keep old rows on failure */ }
    setBusy(false);
  }

  async function loadMore() {
    if (busy || !hasMore) return;
    setBusy(true);
    try {
      const list = await getPage(offset, horse, rider);
      setRows((prev) => [...prev, ...list.filter((x) => !prev.some((y) => y.id === x.id))]);
      setOffset((o) => o + list.length);
      setHasMore(list.length === PAGE);
    } catch { /* retryable */ }
    setBusy(false);
  }

  // Debounce the text search…
  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim().toLowerCase()), 400);
    return () => clearTimeout(t);
  }, [q]);

  // …then make sure the whole (filtered) event is loaded so the search
  // covers everything, not just the visible pages. JSON is cheap; only
  // matching thumbs get rendered.
  useEffect(() => {
    if (!dq || !hasMore || fetchingAll) return;
    let live = true;
    setFetchingAll(true);
    (async () => {
      let off = offset;
      let acc = [];
      for (;;) {
        let list = [];
        try { list = await getPage(off, horse, rider); } catch { break; }
        if (!live) return;
        if (!list.length) break;
        acc = acc.concat(list);
        off += list.length;
        if (list.length < PAGE) break;
      }
      if (!live) return;
      if (acc.length) {
        setRows((prev) => [...prev, ...acc.filter((x) => !prev.some((y) => y.id === x.id))]);
        setOffset(off);
      }
      setHasMore(false);
      setFetchingAll(false);
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);

  const horses = useMemo(() => {
    const m = new Map();
    for (const x of rows || []) {
      if (x.horse_id && x.horse && !m.has(x.horse_id)) m.set(x.horse_id, x.horse);
    }
    return [...m.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);
  const riders = useMemo(() => {
    const m = new Map();
    for (const x of rows || []) {
      if (x.rider_id && x.rider && !m.has(x.rider_id)) m.set(x.rider_id, x.rider);
    }
    return [...m.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const filtered = useMemo(() => (rows || []).filter((x) =>
    (!dq || [x.horse, x.rider, x.class_name].filter(Boolean).some((v) => v.toLowerCase().includes(dq)))), [rows, dq]);

  // Picker options only know loaded rows; a pick refetches server-side so
  // nothing is ever missed. Typing in the search box keeps the pick.
  const pickHorse = (v) => { setHorse(v); refetch(v, rider); };
  const pickRider = (v) => { setRider(v); refetch(horse, v); };

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-3 mb-4">
        <Dropdown ariaLabel="Filter by horse" searchable placeholder="All horses…"
          value={horse} options={[{ value: '', label: 'All horses…' }, ...horses]}
          onSelect={(o) => pickHorse(o.value || '')} block />
        <Dropdown ariaLabel="Filter by rider" searchable placeholder="All riders…"
          value={rider} options={[{ value: '', label: 'All riders…' }, ...riders]}
          onSelect={(o) => pickRider(o.value || '')} block />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search horse, rider, class…"
          aria-label="Search photos"
          className="rounded border border-line bg-ink px-2.5 py-2 text-[13px] text-white placeholder:text-faint focus:border-gold/60 focus:outline-none w-full" />
      </div>
      {busy && !rows.length ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <span key={i} className="sk h-44 w-full rounded-xl" />)}
        </div>
      ) : !filtered.length ? (
        <section className={CARD}>
          <div className="flex flex-col items-center py-10 text-center">
            <h2 className="mt-3 text-[16px] font-bold text-white">No photos match</h2>
            <p className="mt-1 text-[13px] text-muted">Try a different horse, rider or search.</p>
          </div>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {filtered.map((x) => (
              <Link key={x.id} href={`/photos/${x.id}`} className="group flex flex-col rounded-xl border border-line bg-card overflow-hidden no-underline hover:border-gold/50 transition">
                <div className="relative aspect-[4/3] bg-card2 flex items-center justify-center overflow-hidden">
                  {x.thumb_url || x.preview_url
                    ? <img src={x.thumb_url || x.preview_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-[1.03] transition duration-300" />
                    : <span className="text-xl">📷</span>}
                  {x.kind === 'reel' && (
                    <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white">▶ Reel</span>
                  )}
                  {x.moment && MOMENT[x.moment] && (
                    <span className="absolute right-2 top-2 rounded-full bg-goldbg/80 px-2 py-0.5 text-[10.5px] font-bold text-gold">{MOMENT[x.moment]}</span>
                  )}
                </div>
                <div className="flex grow flex-col gap-0.5 p-2.5">
                  <div className="text-[13px] font-bold text-white truncate group-hover:text-gold transition">
                    {[x.horse, x.rider].filter(Boolean).join(' × ') || x.event_name || 'Untagged'}
                  </div>
                  <div className="text-[11px] text-faint truncate">{x.class_name || ''}</div>
                  <div className="mt-auto flex items-center justify-between pt-1">
                    <span className="text-[11px] text-faint">{x.kind === 'reel' ? 'Video' : 'Photo'}</span>
                    {x.price_cents !== null && x.price_cents !== undefined && (
                      <span className="text-[12px] font-bold text-gold tabular-nums">from NZ${(Number(x.price_cents) / 100).toFixed(2)}</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-4 text-center">
            {fetchingAll ? (
              <p className="text-[12.5px] text-faint">Loading all photos for search…</p>
            ) : hasMore && !dq ? (
              <button onClick={loadMore} disabled={busy}
                className="rounded border border-line bg-card2 px-5 py-2.5 text-[13px] font-bold text-white hover:border-gold/50 hover:text-gold cursor-pointer disabled:opacity-60">
                {busy ? 'Loading…' : `Load more (${rows.length} shown)`}
              </button>
            ) : null}
          </div>
        </>
      )}
    </>
  );
}
