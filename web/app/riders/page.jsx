'use client';
import { useEffect, useMemo, useState } from 'react';
import { API } from '../../lib/api';
import { CARD, H1, NUM, SUB, TABLE, TD, TH } from '../../lib/tokens';
import { eqScore } from '../../lib/eq';
import { FilterBar, Pagination } from '../../components/list-controls';
import { heightParams } from '../../lib/heights';
import { useSeason } from '../../components/global';

const DEF = { q: '', season: '', region: '', arena: '', height: '', minStarts: '1', category: '' };

export default function Riders() {
  const [f, setF] = useState(DEF);
  const { season: gSeason } = useSeason();
  useEffect(() => { setF((prev) => ({ ...prev, season: gSeason })); }, [gSeason]);
  const [rows, setRows] = useState([]);
  const [opts, setOpts] = useState({ seasons: [], regions: [], arenas: [] });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/events?limit=100`).then((r) => r.json()).then((j) => {
      const d = j.data || [];
      const uniq = (k) => [...new Set(d.map((x) => x[k]).filter(Boolean))].sort();
      setOpts({ seasons: uniq('season'), regions: uniq('region'), arenas: uniq('arena_type') });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ limit: '200', min_starts: f.minStarts, ...heightParams(f.height) });
    if (f.season) p.set('season', f.season);
    if (f.region) p.set('region', f.region);
    if (f.arena) p.set('arena', f.arena);
    if (f.category) p.set('series', f.category);
    fetch(`${API}/rankings/riders?${p}`)
      .then((r) => r.json())
      .then((j) => {
        setRows(((j.data || []).map((x) => ({ ...x, eq: eqScore(x.clear_pct, x.avg_faults, x.starts) })))
          .sort((a, b) => b.eq - a.eq));
        setPage(1);
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [f.season, f.region, f.arena, f.height, f.minStarts, f.category]);

  const filtered = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((x) => (x.rider || '').toLowerCase().includes(q));
  }, [rows, f.q]);

  useEffect(() => { setPage(1); }, [f.q]);

  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, pages);
  const view = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  return (
    <>
      <h1 className={H1}>Riders</h1>
      <p className={SUB}>Every ranked rider on the NZ circuit.</p>
      <FilterBar f={f} set={setF} seasons={opts.seasons} regions={opts.regions} arenas={opts.arenas} showCategory />
      <section className={CARD}>
        <div className="overflow-x-auto">
        <table className={TABLE}>
          <thead><tr><th className={TH}>Rank</th><th className={TH}>Rider</th><th className={`${TH} ${NUM}`}>Score</th><th className={`${TH} ${NUM}`}>Clear %</th><th className={`${TH} ${NUM}`}>Avg</th><th className={`${TH} ${NUM}`}>Starts</th></tr></thead>
          <tbody>
            {view.map((x, i) => {
              const rank = (safePage - 1) * perPage + i + 1;
              return (
                <tr key={x.rider_id}>
                  <td className={rank === 1 && safePage === 1 ? 'rank1' : ''}>#{rank}</td>
                  <td className={TD}><a href={`/riders/${x.rider_id}`} className="text-white font-semibold">{x.rider}</a></td>
                  <td className={`${TD} ${NUM}`}><b>{x.eq}</b></td>
                  <td className={`${TD} ${NUM} text-moss`}>{Number(x.clear_pct).toFixed(1)}%</td>
                  <td className={`${TD} ${NUM}`}>{Number(x.avg_faults).toFixed(2)}</td>
                  <td className={`${TD} ${NUM}`}>{x.starts}</td>
                </tr>
              );
            })}
            {!view.length && (
              <tr><td colSpan={6} className="px-2 py-6 text-center text-muted">
                {loading ? 'Loading…' : 'No riders match these filters.'}
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
