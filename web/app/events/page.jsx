'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { API } from '../../lib/api';
import { CARD, H1, SUB, TABLE, TD, TH } from '../../lib/tokens';
import { FilterBar, Pagination } from '../../components/list-controls';
import { TableEmpty } from '../../components/EmptyState';
import { useSeason } from '../../components/global';

const DEF = { q: '', season: '', region: '', arena: '', height: '', minStarts: '1' };

export default function Events() {
  const [f, setF] = useState(DEF);
  const [state, setState] = useState('finished'); // finished | upcoming | all
  const { season: gSeason } = useSeason();
  useEffect(() => { setF((prev) => ({ ...prev, season: gSeason })); }, [gSeason]);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ limit: '100' });
    if (state === 'finished') p.set('finished', '1');
    else if (state === 'upcoming') p.set('upcoming', '1');
    else p.set('include_empty', '1');
    if (f.season) p.set('season', f.season);
    if (f.region) p.set('region', f.region);
    if (f.arena) p.set('arena', f.arena);
    fetch(`${API}/events?${p}`)
      .then((r) => r.json())
      .then((j) => { setRows(j.data || []); setPage(1); })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [f.season, f.region, f.arena, state]);

  const [full, setFull] = useState([]);
  useEffect(() => {
    fetch(`${API}/events?limit=100&has_data=1`).then((r) => r.json()).then((j) => setFull(j.data || [])).catch(() => {});
  }, []);
  const pools = useMemo(() => {
    const uniq = (k) => [...new Set(full.map((x) => x[k]).filter(Boolean))].sort();
    return { seasons: uniq('season'), regions: uniq('region'), arenas: uniq('arena_type') };
  }, [full]);

  const filtered = useMemo(() => {
    // Safety net matching the active tab (backend already filters).
    const scoped = state === 'upcoming'
      ? rows.filter((x) => !x.date_start || new Date(x.date_start) > new Date())
      : state === 'all'
        ? rows
        : rows.filter(
          (x) => Number(x.class_count || 0) > 0 || Number(x.round_count || 0) > 0 || Number(x.combo_count || 0) > 0
        );
    const q = f.q.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((x) =>
      (x.name || '').toLowerCase().includes(q) || (x.venue || '').toLowerCase().includes(q));
  }, [rows, f.q, state]);

  useEffect(() => { setPage(1); }, [f.q]);

  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, pages);
  const view = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  return (
    <>
      <h1 className={H1}>Events</h1>
      <p className={SUB}>NZ circuit events, {state === 'upcoming' ? 'soonest first' : 'newest first'}.</p>
      <div className="flex gap-1.5 mb-3">
        {[['finished', 'Finished'], ['upcoming', 'Upcoming'], ['all', 'All']].map(([v, lbl]) => (
          <button key={v} onClick={() => { setState(v); setPage(1); }}
            className={`text-[12.5px] font-semibold no-underline px-3 py-1.5 rounded-full border ${state === v ? 'bg-goldbg text-gold border-gold/50' : 'text-muted border-line hover:text-white'}`}>{lbl}</button>
        ))}
      </div>
      <FilterBar f={f} set={setF} seasons={pools.seasons} regions={pools.regions} arenas={pools.arenas} showHeight={false} showMinStarts={false} />
      <section className={CARD}>
        <div className="overflow-x-auto">
        <table className={TABLE}>
          <thead><tr><th className={TH}>Event</th><th className={TH}>Venue</th><th className={TH}>Dates</th><th className={TH}>Season</th><th className={TH}>Classes</th><th className={TH}>Rounds</th></tr></thead>
          <tbody>
            {view.map((x) => (
              <tr key={x.id}>
                <td className={TD}><Link className="text-sky no-underline" href={`/events/${x.slug || x.id}`}>{x.name}</Link></td>
                <td className={TD}>{x.venue}</td>
                <td className={TD}>{(x.date_start || '').slice(0, 10)} – {(x.date_end || '').slice(0, 10)}</td>
                <td className={TD}>{x.season}</td><td className={TD}>{x.class_count}</td><td className={TD}>{x.round_count}</td>
              </tr>
            ))}
            {!view.length && (
              loading ? (
                <tr><td colSpan={6} className="px-2 py-4">
                  <span className="flex flex-col gap-2 py-1" aria-hidden="true" aria-label="Loading">
                    {[0, 1, 2].map((i) => <span key={i} className="sk h-3.5 w-full" />)}
                  </span>
                </td></tr>
              ) : (
                <TableEmpty icon="📅" title="No events match these filters" hint="Try widening the season, region or search — or reset the filters." />
              )
            )}
          </tbody>
        </table>
        </div>
        <Pagination page={safePage} pages={pages} setPage={setPage} perPage={perPage} setPerPage={setPerPage} total={filtered.length} />
      </section>
    </>
  );
}
