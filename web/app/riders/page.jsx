'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { API } from '../../lib/api';
import { CARD, H1, NUM, SUB, TABLE, TD, TH } from '../../lib/tokens';
import { FilterBar, Pagination } from '../../components/list-controls';
import { TableEmpty } from '../../components/EmptyState';
import { heightParams } from '../../lib/heights';
import { useSeason } from '../../components/global';

const DEF = { q: '', season: '', region: '', arena: '', height: '', minStarts: '1', category: '' };
const TABS = [['rating', 'Rating'], ['points', 'Points']];

export default function Riders() {
  const [tab, setTab] = useState('rating');
  const [f, setF] = useState(DEF);
  const { season: gSeason } = useSeason();
  useEffect(() => { setF((prev) => ({ ...prev, season: gSeason })); }, [gSeason]);
  const [rows, setRows] = useState([]);
  const [opts, setOpts] = useState({ seasons: [], regions: [], arenas: [] });
  const [cats, setCats] = useState(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/events?limit=100&has_data=1`).then((r) => r.json()).then((j) => {
      const d = j.data || [];
      const uniq = (k) => [...new Set(d.map((x) => x[k]).filter(Boolean))].sort();
      setOpts({ seasons: uniq('season'), regions: uniq('region'), arenas: uniq('arena_type') });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`${API}/categories`).then((r) => r.json()).then((j) => setCats(j.data || [])).catch(() => setCats([]));
  }, []);

  useEffect(() => {
    if (tab === 'rating') {
      setLoading(true);
      fetch(`${API}/rankings/modelb/riders?limit=500`)
        .then((r) => r.json())
        .then((j) => { setRows(j.data || []); setPage(1); })
        .catch(() => setRows([]))
        .finally(() => setLoading(false));
      return;
    }
    setLoading(true);
    const p = new URLSearchParams({ limit: '200', min_starts: f.minStarts, ...heightParams(f.height) });
    if (f.season) p.set('season', f.season);
    if (f.region) p.set('region', f.region);
    if (f.arena) p.set('arena', f.arena);
    if (f.category) p.set('series', f.category);
    fetch(`${API}/rankings/riders?${p}&metric=points`)
      .then((r) => r.json())
      .then((j) => {
        setRows(((j.data || []).map((x) => ({ ...x })))
          .sort((a, b) => Number(b.total_points) - Number(a.total_points)));
        setPage(1);
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [tab, f.season, f.region, f.arena, f.height, f.minStarts, f.category]);

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
      <p className={SUB}>{tab === 'rating' ? 'Form rating — every ranked rider on the NZ circuit.' : 'Series points — every ranked rider on the NZ circuit.'}</p>
      <div className="flex gap-1 bg-card2 border border-line rounded p-1 overflow-x-auto w-fit mb-3">
        {TABS.map(([k, lbl]) => (
          <button key={k} onClick={() => { setTab(k); setPage(1); }}
            className={`px-3.5 py-[7px] rounded-md text-[13px] whitespace-nowrap cursor-pointer border-0 ${tab === k ? 'bg-card text-gold font-bold' : 'bg-transparent text-muted hover:text-white'}`}>
            {lbl}
          </button>
        ))}
      </div>
      {tab === 'rating' ? (
        <div className="mb-3 flex flex-wrap items-end gap-2.5 rounded border border-line bg-card p-4">
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Search
            <input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Rider…"
              className="rounded border border-line bg-ink px-2.5 py-2 text-[13px] text-body placeholder:text-faint focus:border-gold/60 focus:outline-none" style={{ width: 200 }} /></label>
          <span className="ml-auto text-[12px] text-faint">Best-12 · min 20 rounds to rank · <Link href="/standings" className="text-sky no-underline hover:underline">Combination standings →</Link></span>
        </div>
      ) : (
      <FilterBar f={f} set={setF} seasons={opts.seasons} regions={opts.regions} arenas={opts.arenas} categories={cats} showCategory />
      )}
      <section className={CARD}>
        <div className="overflow-x-auto">
        <table className={TABLE}>
          <thead><tr><th className={TH}>Rank</th><th className={TH}>Rider</th>
            {tab === 'rating'
              ? (<><th className={`${TH} ${NUM}`}>Rating</th><th className={`${TH} ${NUM}`}>Horses</th><th className={`${TH} ${NUM}`}>Rounds</th><th className={TH}>Form</th></>)
              : (<><th className={`${TH} ${NUM}`}>Points</th><th className={`${TH} ${NUM}`}>Clear %</th><th className={`${TH} ${NUM}`}>Avg</th><th className={`${TH} ${NUM}`}>Starts</th></>)}
          </tr></thead>
          <tbody>
            {view.map((x, i) => {
              const rank = (safePage - 1) * perPage + i + 1;
              return (
                <tr key={x.rider_id}>
                  <td className={rank === 1 && safePage === 1 ? 'rank1' : ''}>{tab === 'rating' && !x.eligible ? '–' : `#${rank}`}</td>
                  <td className={TD}><Link href={`/riders/${x.rider_slug || x.rider_id}`} className="text-white font-semibold">{x.rider}</Link></td>
                  {tab === 'rating' ? (<>
                    <td className={`${TD} ${NUM}`}><b className={rank === 1 && safePage === 1 && x.eligible ? 'text-gold' : ''}>{x.eligible ? Number(x.best12).toFixed(1) : '–'}</b></td>
                    <td className={`${TD} ${NUM} text-muted`}>{x.horses_ridden}</td>
                    <td className={`${TD} ${NUM} text-muted`}>{x.rounds}</td>
                    <td className={`${TD} text-muted text-[12px]`}>{x.eligible ? (x.form_score === null ? '' : `form ${Number(x.form_score).toFixed(1)}`) : 'building form'}</td>
                  </>) : (<>
                  <td className={`${TD} ${NUM}`}><b>{Number(x.total_points)}</b></td>
                  <td className={`${TD} ${NUM} text-moss`}>{Number(x.clear_pct).toFixed(1)}%</td>
                  <td className={`${TD} ${NUM}`}>{Number(x.avg_faults).toFixed(2)}</td>
                  <td className={`${TD} ${NUM}`}>{x.starts}</td>
                  </>)}
                </tr>
              );
            })}
            {!view.length && (
              loading ? (
                <tr><td colSpan={6} className="px-2 py-4">
                  <span className="flex flex-col gap-2 py-1" aria-hidden="true" aria-label="Loading">
                    {[0, 1, 2].map((i) => <span key={i} className="sk h-3.5 w-full" />)}
                  </span>
                </td></tr>
              ) : (
                <TableEmpty icon="🏇" title="No riders match these filters" hint="Try widening the season, region or search — or reset the filters." />
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
