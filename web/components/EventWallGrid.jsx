'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import Dropdown from './Dropdown';
import { CARD } from '../lib/tokens';

const MOMENT = {
  win: '🏆 Win', clear: '✨ Clear round', debut: '🌟 Debut', pb: '⚡ PB',
};

// Client-side filters + grid for an event photo wall. Options are derived
// from the wall's own photos (scoped to this event, no extra requests).
export default function EventWallGrid({ rows }) {
  const [horse, setHorse] = useState('');
  const [rider, setRider] = useState('');
  const [q, setQ] = useState('');

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

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows || []).filter((x) =>
      (!horse || String(x.horse_id) === String(horse)) &&
      (!rider || String(x.rider_id) === String(rider)) &&
      (!s || [x.horse, x.rider, x.class_name].filter(Boolean).some((v) => v.toLowerCase().includes(s))));
  }, [rows, horse, rider, q]);

  if (!rows?.length) return null;
  return (
    <>
      <div className="grid gap-2 sm:grid-cols-3 mb-4">
        <Dropdown ariaLabel="Filter by horse" searchable placeholder="All horses…"
          value={horse} options={[{ value: '', label: 'All horses…' }, ...horses]}
          onSelect={(o) => setHorse(o.value || '')} block />
        <Dropdown ariaLabel="Filter by rider" searchable placeholder="All riders…"
          value={rider} options={[{ value: '', label: 'All riders…' }, ...riders]}
          onSelect={(o) => setRider(o.value || '')} block />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search horse, rider, class…"
          aria-label="Search photos"
          className="rounded border border-line bg-ink px-2.5 py-2 text-[13px] text-white placeholder:text-faint focus:border-gold/60 focus:outline-none w-full" />
      </div>
      {!filtered.length ? (
        <section className={CARD}>
          <div className="flex flex-col items-center py-10 text-center">
            <h2 className="mt-3 text-[16px] font-bold text-white">No photos match</h2>
            <p className="mt-1 text-[13px] text-muted">Try a different horse, rider or search.</p>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {filtered.map((x) => (
            <Link key={x.id} href={`/photos/${x.id}`} className="group flex flex-col rounded-xl border border-line bg-card overflow-hidden no-underline hover:border-gold/50 transition">
              <div className="relative aspect-[4/3] bg-card2 flex items-center justify-center overflow-hidden">
                {x.thumb_url || x.preview_url
                  ? <img src={x.thumb_url || x.preview_url} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.03] transition duration-300" />
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
      )}
    </>
  );
}
