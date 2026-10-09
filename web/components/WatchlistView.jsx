'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';

function placingBadge(place, status) {
  if (status && status !== 'finished') {
    const code = { eliminated: 'E', retired: 'R', withdrawn: 'W', disqualified: 'DQ' }[status] || '–';
    return <span className="text-faint">{code}</span>;
  }
  const p = Number(place);
  if (!p) return <span className="text-faint">—</span>;
  const lbl = p === 1 ? '1st' : p === 2 ? '2nd' : p === 3 ? '3rd' : `${p}th`;
  return <span className="font-semibold text-gold">{lbl}</span>;
}

function EventAthleteCard({ a }) {
  const [open, setOpen] = useState(false);
  const rounds = a.rounds.length;
  const clears = a.rounds.filter((r) => r.clear).length;
  const withPlace = a.rounds.filter((r) => r.place !== null && r.place !== undefined);
  const best = withPlace.length ? Math.min(...withPlace.map((r) => r.place)) : null;
  const profileHref = `/${a.kind === 'horse' ? 'horses' : 'riders'}/${a.slug || a.id}`;
  const partnerKey = a.kind === 'horse' ? 'rider' : 'horse';
  const partnerSlug = a.kind === 'horse' ? 'rider_slug' : 'horse_slug';
  const partnerId = a.kind === 'horse' ? 'rider_id' : 'horse_id';
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
    </div>
  );
}

export default function WatchlistView({ pulse, byEvent }) {
  const [q, setQ] = useState('');
  const [evFilter, setEvFilter] = useState('');

  const matchQ = (s) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return (s || '').toLowerCase().includes(t);
  };

  // ---- by-event view: one card per watched athlete per event ----
  const evGroups = useMemo(() => {
    const all = byEvent || [];
    const grouped = (evFilter ? all.filter((g) => (g.event_id || g.event) === evFilter) : all)
      .map((g) => {
        const byAth = {};
        for (const e of g.entries) {
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
  }, [byEvent, evFilter, q]);
  const evChips = useMemo(() => (byEvent || []).map((g) => ({
    key: g.event_id || g.event, label: g.event,
  })), [byEvent]);


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

      <div className="min-w-0 space-y-4">
        {!evGroups.length && (
          <p className="text-faint text-sm">No watched rounds at events yet — results appear here once your stable competes.</p>
        )}
          {evGroups.map((g) => {
            const key = g.event_id || g.event;
            const rate = g.entries.length ? (100 * g.clears) / g.entries.length : null;
            return (
              <section key={key} className="bg-card border border-line rounded p-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
                  {g.event_id ? (
                    <Link href={`/events/${g.event_id}`} className="text-white font-bold text-[15px] no-underline hover:text-gold">{g.event}</Link>
                  ) : (
                    <span className="text-white font-bold text-[15px]">{g.event}</span>
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
                    <EventAthleteCard key={`${a.kind}-${a.id}`} a={a} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
    </>
  );
}
