'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { API } from '../../lib/api';
import { CARD, H1, NUM, SUB, TABLE, TD, TH } from '../../lib/tokens';
import { FilterBar, Pagination } from '../../components/list-controls';
import { TableEmpty } from '../../components/EmptyState';
import { heightParams } from '../../lib/heights';
import { useSeason } from '../../components/global';

const DEF = { q: '', season: '', region: '', arena: '', height: '', minStarts: '5' };
const TABS = [['rating', 'Rating'], ['clear', 'Clear %']];
const AGE_GROUPS = [['', 'All ages'], ['5', '5YO'], ['6', '6YO'], ['7', '7YO'], ['8', '8YO'], ['9+', '9 & over']];
// NZ age: season starting year minus birth year (birthday 1 Aug).
const horseAge = (yob, season) => {
  if (yob === null || yob === undefined || yob === '') return null;
  const y = Number(yob);
  if (!Number.isInteger(y) || y < 1900 || y > 2100) return null;
  const m = /^(\d{4})/.exec(season || '');
  const base = m ? Number(m[1]) : new Date().getFullYear();
  return base - y;
};

export default function Horses() {
  const [tab, setTab] = useState('rating');
  const [f, setF] = useState(DEF);
  const { season: gSeason } = useSeason();
  useEffect(() => { setF((prev) => ({ ...prev, season: gSeason })); }, [gSeason]);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [ageGroup, setAgeGroup] = useState('');

  const [opts, setOpts] = useState({ seasons: [], regions: [], arenas: [] });
  useEffect(() => {
    fetch(`${API}/events?limit=100&has_data=1`).then((r) => r.json()).then((j) => {
      const d = j.data || [];
      const uniq = (k) => [...new Set(d.map((x) => x[k]).filter(Boolean))].sort();
      setOpts({ seasons: uniq('season'), regions: uniq('region'), arenas: uniq('arena_type') });
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rating tab: best-12 (global, no slice filters).
  // Clear tab: factual clear-rate stat (info only, min 5 starts).
  useEffect(() => {
    if (tab === 'rating') {
      setLoading(true);
      fetch(`${API}/rankings/modelb/horses?limit=500`)
        .then((r) => r.json())
        .then((j) => { setRows(j.data || []); setPage(1); })
        .catch(() => setRows([]))
        .finally(() => setLoading(false));
      return;
    }
    setLoading(true);
    const p = new URLSearchParams({ limit: '500', min_starts: f.minStarts, ...heightParams(f.height) });
    if (f.season) p.set('season', f.season);
    if (f.region) p.set('region', f.region);
    if (f.arena) p.set('arena', f.arena);
    fetch(`${API}/rankings/horses?${p}`)
      .then((r) => r.json())
      .then((j) => { setRows(j.data || []); setPage(1); })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [tab, f.season, f.region, f.arena, f.height, f.minStarts]);

  const filtered = useMemo(() => {
    let out = rows;
    if (ageGroup) {
      out = out.filter((x) => {
        const a = horseAge(x.year_of_birth, f.season);
        if (a === null) return false;
        return ageGroup === '9+' ? a >= 9 : a === Number(ageGroup);
      });
    }
    const q = f.q.trim().toLowerCase();
    if (!q) return out;
    return out.filter((x) => (x.horse || '').toLowerCase().includes(q));
  }, [rows, f.q, ageGroup, f.season]);

  useEffect(() => { setPage(1); }, [f.q]);
  const list = filtered;

  const pages = Math.max(1, Math.ceil(list.length / perPage));
  const safePage = Math.min(page, pages);
  const view = list.slice((safePage - 1) * perPage, safePage * perPage);

  return (
    <>
      <h1 className={H1}>Horses</h1>
      <p className={SUB}>{tab === 'rating' ? 'Form rating — every ranked horse on the NZ circuit.' : 'Clear-rate statistics across the circuit.'}</p>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex gap-1 bg-card2 border border-line rounded p-1 overflow-x-auto w-fit">
          {TABS.map(([k, lbl]) => (
            <button key={k} onClick={() => { setTab(k); setPage(1); }}
              className={`px-3.5 py-[7px] rounded-md text-[13px] whitespace-nowrap cursor-pointer border-0 ${tab === k ? 'bg-card text-gold font-bold' : 'bg-transparent text-muted hover:text-white'}`}>
              {lbl}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 items-center">
          <span className="text-[11px] text-faint">Age:</span>
          {AGE_GROUPS.map(([v, lbl]) => (
            <button key={v || 'all'} onClick={() => { setAgeGroup(v); setPage(1); }}
              className={`text-[12px] no-underline px-2.5 py-1 rounded-full border ${ageGroup === v ? 'bg-goldbg text-gold border-gold/50 font-bold' : 'text-muted border-line hover:text-white'}`}>{lbl}</button>
          ))}
        </div>
      </div>
      {tab === 'rating' ? (
        <div className="mb-3 flex flex-wrap items-end gap-2.5 rounded border border-line bg-card p-4">
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Search
            <input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Horse…"
              className="rounded border border-line bg-ink px-2.5 py-2 text-[13px] text-body placeholder:text-faint focus:border-gold/60 focus:outline-none" style={{ width: 200 }} /></label>
          <span className="ml-auto text-[12px] text-faint">Best-12 · min 10 rounds to rank · <Link href="/standings" className="text-sky no-underline hover:underline">Combination standings →</Link></span>
        </div>
      ) : (
        <FilterBar f={f} set={setF} seasons={opts.seasons} regions={opts.regions} arenas={opts.arenas} showMinStarts />
      )}
      <section className={CARD}>
        <div className="overflow-x-auto">
        <table className={TABLE}>
          <thead><tr>
            <th className={TH}>Rank</th><th className={TH}>Horse</th><th className={`${TH} ${NUM}`}>Age</th>
            {tab === 'rating' && (<><th className={`${TH} ${NUM}`}>Rating</th><th className={`${TH} ${NUM}`}>Rounds</th><th className={TH}>Form</th></>)}
            {tab === 'clear' && (<><th className={`${TH} ${NUM}`}>Clear %</th><th className={`${TH} ${NUM}`}>Avg</th><th className={`${TH} ${NUM}`}>Starts</th></>)}
          </tr></thead>
          <tbody>
            {view.map((x, i) => {
              const rank = (safePage - 1) * perPage + i + 1;
              const age = horseAge(x.year_of_birth, f.season);
              return (
                <tr key={x.horse_id}>
                  <td className={rank === 1 && safePage === 1 ? 'rank1' : ''}>{tab === 'rating' && !x.eligible ? '–' : `#${rank}`}</td>
                  <td className={TD}><Link href={`/horses/${x.horse_slug || x.horse_id || ''}`} className="text-white font-semibold">{x.horse}</Link></td>
                  <td className={`${TD} ${NUM} text-muted`}>{age === null ? '–' : age}</td>
                  {tab === 'rating' && (<>
                    <td className={`${TD} ${NUM}`}><b className={rank === 1 && safePage === 1 && x.eligible ? 'text-gold' : ''}>{x.eligible ? Number(x.best12).toFixed(1) : '–'}</b></td>
                    <td className={`${TD} ${NUM} text-muted`}>{x.rounds}</td>
                    <td className={`${TD} text-muted text-[12px]`}>{x.eligible ? (x.form_score === null ? '' : `form ${Number(x.form_score).toFixed(1)}`) : `needs ${Math.max(1, 10 - Number(x.rounds || 0))} more rounds to rank`}</td>
                  </>)}
                  {tab === 'clear' && (<>
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
                    {[0, 1, 2].map((k) => <span key={k} className="sk h-3.5 w-full" />)}
                  </span>
                </td></tr>
              ) : (
                <TableEmpty icon="🐎" title="No horses match these filters" hint="Try widening the season, region or search — or reset the filters." />
              )
            )}
          </tbody>
        </table>
        </div>
        <Pagination page={safePage} pages={pages} setPage={setPage} perPage={perPage} setPerPage={setPerPage} total={list.length} />
      </section>
    </>
  );
}
