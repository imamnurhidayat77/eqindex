'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { API } from '../lib/api';
import PackageUpsell from './PackageUpsell';
import CreditBuyButton from './CreditBuyButton';

async function deleteWatch(watchId) {
  const res = await fetch(`${API}/watchlist/${watchId}`, {
    method: 'DELETE', credentials: 'include',
  });
  if (!res.ok) throw new Error(`Unwatch failed (${res.status})`);
}

function placingBadge(place, status) {
  const p = Number(place);
  if (p) {
    const lbl = p === 1 ? '1st' : p === 2 ? '2nd' : p === 3 ? '3rd' : `${p}th`;
    return <span className="font-semibold text-gold">{lbl}</span>;
  }
  if (status && status !== 'finished') {
    const code = { eliminated: 'E', retired: 'R', withdrawn: 'W', disqualified: 'DQ' }[status] || '–';
    return <span className="text-faint">{code}</span>;
  }
  return <span className="text-faint">—</span>;
}

function EventAthleteCard({ a, photos, eventId, viewAllHref, onUnwatch }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rounds = a.rounds.length;
  const clears = a.rounds.filter((r) => r.clear).length;
  const withPlace = a.rounds.filter((r) => r.place !== null && r.place !== undefined);
  const best = withPlace.length ? Math.min(...withPlace.map((r) => r.place)) : null;
  const profileHref = `/${a.kind === 'horse' ? 'horses' : 'riders'}/${a.slug || a.id}`;
  const partnerKey = a.kind === 'horse' ? 'rider' : 'horse';
  const partnerSlug = a.kind === 'horse' ? 'rider_slug' : 'horse_slug';
  const partnerId = a.kind === 'horse' ? 'rider_id' : 'horse_id';
  const shots = (photos || []).slice(0, 4);
  const horseId = a.kind === 'horse' ? a.id : null;
  const riderId = a.kind === 'horse' ? null : a.id;
  return (
    <div className="rounded bg-card2 border border-rowline px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className={`text-[10px] font-bold uppercase tracking-wide ${a.kind === 'horse' ? 'text-moss' : 'text-sky'}`}>{a.kind}</span>
        <Link href={profileHref} className="text-white font-semibold text-[13.5px] no-underline hover:text-gold">{a.name}</Link>
        <span className="text-faint text-[12px]">
          {rounds} round{rounds === 1 ? '' : 's'} · <span className="text-moss font-semibold">{clears} clear{clears === 1 ? '' : 's'}</span>
          {best !== null ? <> · best <span className="text-gold font-bold">#{best}</span></> : null}
        </span>
        <span className="flex-1" />
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="text-[12px] text-muted hover:text-white bg-none border border-line rounded px-2.5 py-1 cursor-pointer">
          {open ? 'Hide rounds ▲' : `Show rounds (${rounds}) ▼`}
        </button>
        {a.watchId && onUnwatch && (
          <button
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              try { await deleteWatch(a.watchId); onUnwatch(a.watchId); }
              catch { /* tetap tampilkan, user bisa coba lagi */ }
              setBusy(false);
            }}
            disabled={busy}
            title={`Unwatch ${a.name}`}
            className="text-[12px] text-faint hover:text-danger bg-none border border-line rounded px-2.5 py-1 cursor-pointer"
          >
            {busy ? '…' : 'Unwatch ✕'}
          </button>
        )}
      </div>
      {open && (
        <div className="mt-2 border-t border-rowline pt-2 overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px] min-w-[640px]">
            <thead><tr className="text-left text-[10.5px] uppercase tracking-wide text-muted">
              <th className="border-b border-line px-2 py-1.5 font-semibold">Date</th>
              <th className="border-b border-line px-2 py-1.5 font-semibold">Class</th>
              <th className="border-b border-line px-2 py-1.5 font-semibold">Height</th>
              <th className="border-b border-line px-2 py-1.5 font-semibold">{a.kind === 'horse' ? 'Rider' : 'Horse'}</th>
              <th className="border-b border-line px-2 py-1.5 font-semibold text-right">Jump</th>
              <th className="border-b border-line px-2 py-1.5 font-semibold text-right">Time</th>
              <th className="border-b border-line px-2 py-1.5 font-semibold text-right">Total</th>
              <th className="border-b border-line px-2 py-1.5 font-semibold text-right">Placing</th>
            </tr></thead>
            <tbody>
              {a.rounds.map((r, i) => (
                <tr key={i} className="border-b border-line/50 last:border-0 hover:bg-white/[0.02]">
                  <td className="whitespace-nowrap px-2 py-1.5 text-muted">{r.date ? String(r.date).slice(0, 10) : '–'}</td>
                  <td className="px-2 py-1.5 text-slate-200">{r.cls || '—'}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-muted">{r.height ? `${(Number(r.height) / 100).toFixed(2)}m` : '—'}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <Link href={`/${a.kind === 'horse' ? 'riders' : 'horses'}/${r[partnerSlug] || r[partnerId]}`} className="text-white hover:text-gold">{r[partnerKey]}</Link>
                  </td>
                  {r.status !== 'finished' ? (
                    <>
                      <td className="px-2 py-1.5 text-right text-faint">–</td>
                      <td className="px-2 py-1.5 text-right text-faint">–</td>
                      <td className="px-2 py-1.5 text-right text-faint">–</td>
                    </>
                  ) : (
                    <>
                      <td className={`px-2 py-1.5 text-right font-semibold ${Number(r.jumpfaults) === 0 ? 'text-mint' : 'text-danger'}`}>{r.jumpfaults ?? '–'}</td>
                      <td className={`px-2 py-1.5 text-right ${Number(r.timefaults) === 0 ? 'text-mint' : 'text-danger'}`}>{r.timefaults === null || r.timefaults === undefined ? '–' : Number(r.timefaults).toFixed(2)}</td>
                      <td className={`px-2 py-1.5 text-right font-bold ${Number(r.faults) === 0 ? 'text-mint' : 'text-danger'}`}>{r.faults === null || r.faults === undefined ? '–' : Number(r.faults).toFixed(2)}</td>
                    </>
                  )}
                  <td className="px-2 py-1.5 text-right">{placingBadge(r.place, r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!!shots.length && (
        <div className="mt-2 border-t border-rowline pt-2">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-faint font-bold">
              📷 {shots.length}{shots.length >= 4 && (photos || []).length > 4 ? ` of ${(photos || []).length}` : ''} at this event
            </span>
            <span className="flex-1" />
            {viewAllHref && (
              <Link href={viewAllHref} className="text-sky text-[11.5px] no-underline hover:underline">View all →</Link>
            )}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {shots.map((x) => (
              <Link key={x.id} href={`/photos/${x.id}`} className="block rounded border border-line bg-card overflow-hidden no-underline hover:border-gold/50">
                <div className="aspect-[4/3] flex items-center justify-center overflow-hidden">
                  {x.thumb_url || x.preview_url
                    ? <img src={x.thumb_url || x.preview_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                    : <span className="text-lg">{x.kind === 'reel' ? '🎬' : '📷'}</span>}
                </div>
              </Link>
            ))}
          </div>
          {eventId && (
            <>
              <CreditBuyButton eventId={eventId} horseId={horseId} riderId={riderId} />
              <PackageUpsell eventId={eventId} horseId={horseId} riderId={riderId} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function WatchlistView({ horses = [], riders = [], pulse = { rounds: 0, clears: 0, podiums: 0, wins: 0 }, byEvent, photoGroups }) {
  const [q, setQ] = useState('');
  const [evFilter, setEvFilter] = useState('');
  const [removed, setRemoved] = useState([]);
  const [busyId, setBusyId] = useState(null);

  const matchQ = (s) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return (s || '').toLowerCase().includes(t);
  };

  const handleUnwatch = (watchId) =>
    setRemoved((prev) => (prev.includes(watchId) ? prev : [...prev, watchId]));

  async function unwatchId(watchId) {
    if (!watchId || busyId) return;
    setBusyId(watchId);
    try {
      await deleteWatch(watchId);
      handleUnwatch(watchId);
    } catch { /* biarkan tombol tetap ada untuk retry */ }
    setBusyId(null);
  }

  // Daftar kelola: satu-satunya cara unwatch yang belum punya rounds
  // (tidak muncul di byEvent). page.jsx sudah kirim horses/riders + watchId.
  const watched = useMemo(() => {
    const all = [...(horses || []), ...(riders || [])]
      .filter((w) => !removed.includes(w.watchId))
      .filter((w) => matchQ(w.name));
    return all;
  }, [horses, riders, removed, q]);

  // ---- by-event view: one card per watched athlete per event ----
  const evGroups = useMemo(() => {
    const all = byEvent || [];
    const grouped = (evFilter ? all.filter((g) => (g.event_id || g.event) === evFilter) : all)
      .map((g) => {
        const byAth = {};
        for (const e of g.entries) {
          if (removed.includes(e.watchId)) continue;
          if (!matchQ(`${e.name} ${e.kind === 'horse' ? e.rider : e.horse}`)) continue;
          const k = `${e.kind}:${e.id}`;
          (byAth[k] ||= { kind: e.kind, id: e.id, watchId: e.watchId, slug: e.slug, name: e.name, rounds: [] }).rounds.push(e);
        }
        const athletes = Object.values(byAth).sort((a, b) =>
          (b.rounds.filter((r) => r.clear).length - a.rounds.filter((r) => r.clear).length)
          || (b.rounds.reduce((s, r) => s + (Number(r.points) || 0), 0) - a.rounds.reduce((s, r) => s + (Number(r.points) || 0), 0)));
        if (!athletes.length) return null;
        return { ...g, athletes };
      })
      .filter(Boolean);
    return grouped;
  }, [byEvent, evFilter, q, removed]);
  const evChips = useMemo(() => (byEvent || []).map((g) => ({
    key: g.event_id || g.event, label: g.event,
  })), [byEvent]);

  // ---- photos merged into their event (photos live where the event lives) ----
  // photoGroups arrive grouped Event -> Horse; flatten per event key so each
  // event card can show its athletes' shots + a leftover strip. The old
  // standalone section is gone: a photo without its event felt lost.
  const eventShots = useMemo(() => {
    const map = new Map();
    for (const g of photoGroups || []) {
      const k = g.event_id || g.event_name || 'noevent';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(...(g.photos || []));
    }
    return map;
  }, [photoGroups]);

  const athleteHref = (g, a) => {
    const qp = new URLSearchParams();
    if (g.event_id) qp.set('event', g.event_id);
    qp.set(a.kind === 'horse' ? 'horse' : 'rider', a.id);
    return `/photos?${qp}`;
  };


  return (
    <>
      {/* stable pulse — what happened while you were away */}
      <div className="bg-card border border-line rounded p-4 mb-5 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div>
          <div className="text-[11px] text-muted tracking-[0.4px] uppercase">Last 30 days</div>
          <div className="text-[15px] font-bold mt-0.5">
            {pulse.rounds} rounds · <span className="text-moss">{pulse.clears} clears</span>
            {pulse.podiums ? <> · <span className="text-gold">{pulse.podiums} podiums</span></> : null}
            {pulse.wins ? <> · <span className="text-gold">{pulse.wins} {pulse.wins === 1 ? 'win' : 'wins'}</span></> : null}
            {!pulse.rounds ? <span className="text-faint font-normal"> — no tracked rounds yet</span> : null}
          </div>
        </div>
        <div className="flex-1" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by horse, rider or partner…"
          className="rounded border border-line bg-ink px-2.5 py-2 text-[13px] text-white placeholder:text-faint focus:border-gold/60 focus:outline-none w-full sm:w-[260px]"
        />
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4 items-center">
        <span className="text-[11px] text-faint">Event:</span>
        <button onClick={() => setEvFilter('')}
          className={`text-[12px] no-underline px-2.5 py-1 rounded-full border ${!evFilter ? 'bg-goldbg text-gold border-gold/50 font-bold' : 'text-muted border-line hover:text-white'}`}>All events</button>
        {evChips.map((c) => (
          <button key={c.key} onClick={() => setEvFilter(c.key)}
            className={`text-[12px] no-underline px-2.5 py-1 rounded-full border ${evFilter === c.key ? 'bg-goldbg text-gold border-gold/50 font-bold' : 'text-muted border-line hover:text-white'}`}>{c.label}</button>
        ))}
      </div>

      {/* manage: unwatch langsung dari sini, termasuk yang belum punya rounds */}
      {!!watched.length && (
        <section className="bg-card border border-line rounded p-4 mb-4">
          <div className="text-[11px] text-muted tracking-[0.4px] uppercase mb-2">
            Watched ({watched.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {watched.map((w) => (
              <span key={`${w.kind}-${w.watchId}`} className="inline-flex items-center gap-2 rounded-full border border-line bg-card2 pl-2.5 pr-1.5 py-1 text-[12.5px]">
                <span className={`text-[10px] font-bold uppercase ${w.kind === 'horse' ? 'text-moss' : 'text-sky'}`}>{w.kind}</span>
                <Link
                  href={`/${w.kind === 'horse' ? 'horses' : 'riders'}/${w.slug || w.id}`}
                  className="text-white no-underline hover:text-gold font-semibold"
                >
                  {w.name}
                </Link>
                <button
                  onClick={() => unwatchId(w.watchId)}
                  disabled={busyId === w.watchId}
                  title={`Unwatch ${w.name}`}
                  className="text-faint hover:text-danger bg-none border-0 cursor-pointer text-[12px] px-1"
                >
                  {busyId === w.watchId ? '…' : '✕'}
                </button>
              </span>
            ))}
          </div>
        </section>
      )}

      <div className="min-w-0 space-y-4">
        {!evGroups.length && (
          <p className="text-faint text-sm">No watched rounds at events yet — results appear here once your stable competes.</p>
        )}
          {evGroups.map((g) => {
            const key = g.event_id || g.event;
            const rate = g.entries.length ? (100 * g.clears) / g.entries.length : null;
            const shots = eventShots.get(key) || [];
            const matched = new Set();
            const shotsFor = (a) => {
              const list = shots.filter((x) => {
                const hit = (a.kind === 'horse' ? x.horse_id : x.rider_id) === a.id;
                if (hit) matched.add(x.id);
                return hit;
              });
              return list;
            };
            const leftover = shots.filter((x) => !matched.has(x.id) && matchQ([x.horse, x.rider, x.event_name].filter(Boolean).join(' ')));
            const evHref = (() => {
              const qp = new URLSearchParams();
              if (g.event_id) qp.set('event', g.event_id);
              return `/photos?${qp}`;
            })();
            return (
              <section key={key} className="bg-card border border-line rounded p-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
                  {g.event_id ? (
                    <Link href={`/events/${g.event_id}`} className="text-white font-bold text-[15px] no-underline hover:text-gold">{g.event}</Link>
                  ) : (
                    <span className="text-white font-bold text-[15px]">{g.event}</span>
                  )}
                  {!!shots.length && (
                    <span className="rounded-full border border-line px-2 py-px text-[11px] font-bold text-muted">
                      📷 {shots.length}
                    </span>
                  )}
                  <span className="text-[12px] text-faint ml-auto">{g.when || ''}</span>
                </div>
                <div className="text-[12.5px] text-muted mb-2.5">
                  {g.entries.length} {g.entries.length === 1 ? 'entry' : 'entries'} ·{' '}
                  <span className="text-moss font-semibold">{g.clears} clear{g.clears === 1 ? '' : 's'}</span>
                  {rate !== null ? <span className="text-faint"> ({rate.toFixed(0)}%)</span> : null}
                  {g.best !== null && g.best !== undefined ? <> · best <span className="text-gold font-bold">#{g.best}</span></> : null}
                </div>
                <div className="space-y-1.5">
                  {g.athletes.map((a) => (
                    <EventAthleteCard key={`${a.kind}-${a.id}`} a={a}
                      photos={shotsFor(a)} eventId={g.event_id} viewAllHref={athleteHref(g, a)}
                      onUnwatch={handleUnwatch} />
                  ))}
                </div>
                {!!leftover.length && (
                  <div className="mt-2 rounded bg-card2 border border-rowline px-3 py-2.5">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="text-[11px] uppercase tracking-wide text-faint font-bold">
                        📷 More from this event ({leftover.length})
                      </span>
                      <span className="flex-1" />
                      <Link href={evHref} className="text-sky text-[11.5px] no-underline hover:underline">View all →</Link>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {leftover.slice(0, 4).map((x) => (
                        <Link key={x.id} href={`/photos/${x.id}`} className="block rounded border border-line bg-card overflow-hidden no-underline hover:border-gold/50">
                          <div className="aspect-[4/3] flex items-center justify-center overflow-hidden">
                            {x.thumb_url || x.preview_url
                              ? <img src={x.thumb_url || x.preview_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                              : <span className="text-lg">{x.kind === 'reel' ? '🎬' : '📷'}</span>}
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      {(eventShots.get('noevent') || []).length > 0 && (
        <div className="mt-4 rounded border border-line bg-card p-3">
          <div className="mb-1.5 text-[11px] uppercase tracking-wide text-faint font-bold">
            📷 Photos without event ({eventShots.get('noevent').length})
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {eventShots.get('noevent').slice(0, 4).map((x) => (
              <Link key={x.id} href={`/photos/${x.id}`} className="block rounded border border-line bg-card2 overflow-hidden no-underline hover:border-gold/50">
                <div className="aspect-[4/3] flex items-center justify-center overflow-hidden">
                  {x.thumb_url || x.preview_url
                    ? <img src={x.thumb_url || x.preview_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                    : <span className="text-lg">{x.kind === 'reel' ? '🎬' : '📷'}</span>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
