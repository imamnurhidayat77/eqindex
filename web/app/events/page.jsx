'use client';
import { useEffect, useMemo, useState } from 'react';
import { API } from '../../lib/api';
import { CARD, H1, SUB, TABLE, TD, TH } from '../../lib/tokens';
import { FilterBar, Pagination } from '../../components/list-controls';
import { useSeason } from '../../components/global';

const DEF = { q: '', season: '', region: '', arena: '', height: '', minStarts: '1' };

export default function Events() {
  const [f, setF] = useState(DEF);
  const { season: gSeason } = useSeason();
  useEffect(() => { setF((prev) => ({ ...prev, season: gSeason })); }, [gSeason]);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ limit: '100' });
    if (f.season) p.set('season', f.season);
    if (f.region) p.set('region', f.region);
    if (f.arena) p.set('arena', f.arena);
    fetch(`${API}/events?${p}`)
      .then((r) => r.json())
      .then((j) => { setRows(j.data || []); setPage(1); })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [f.season, f.region, f.arena]);

  const [full, setFull] = useState([]);
  useEffect(() => {
    fetch(`${API}/events?limit=100`).then((r) => r.json()).then((j) => setFull(j.data || [])).catch(() => {});
  }, []);
  const pools = useMemo(() => {
    const uniq = (k) => [...new Set(full.map((x) => x[k]).filter(Boolean))].sort();
    return { seasons: uniq('season'), regions: uniq('region'), arenas: uniq('arena_type') };
  }, [full]);

  const filtered = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((x) =>
      (x.name || '').toLowerCase().includes(q) || (x.venue || '').toLowerCase().includes(q));
  }, [rows, f.q]);

  useEffect(() => { setPage(1); }, [f.q]);

  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, pages);
  const view = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  return (
    <>
      <h1 className={H1}>Events</h1>
      <p className={SUB}>NZ circuit events, newest first.</p>
      <FilterBar f={f} set={setF} seasons={pools.seasons} regions={pools.regions} arenas={pools.arenas} showHeight={false} showMinStarts={false} />
      <section className={CARD}>
        <div className="overflow-x-auto">
        <table className={TABLE}>
          <thead><tr><th className={TH}>Event</th><th className={TH}>Venue</th><th className={TH}>Dates</th><th className={TH}>Season</th><th className={TH}>Classes</th><th className={TH}>Rounds</th></tr></thead>
          <tbody>
            {view.map((x) => (
              <tr key={x.id}>
                <td className={TD}><a className="text-sky no-underline" href={`/events/${x.id}`}>{x.name}</a></td>
                <td className={TD}>{x.venue}</td>
                <td className={TD}>{(x.date_start || '').slice(0, 10)} – {(x.date_end || '').slice(0, 10)}</td>
                <td className={TD}>{x.season}</td><td className={TD}>{x.class_count}</td><td className={TD}>{x.round_count}</td>
              </tr>
            ))}
            {!view.length && (
              <tr><td colSpan={6} className="px-2 py-6 text-center text-muted">
                {loading ? 'Loading…' : 'No events match these filters.'}
              </td></tr>
            )}
          </tbody>
        </table>
        </div>
        <Pagination page={safePage} pages={pages} setPage={setPage} perPage={perPage} setPerPage={setPerPage} total={filtered.length} />
      </section>
    </>
  );
}
