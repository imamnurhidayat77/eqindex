'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { API } from '../../lib/api';
import { CARD, NUM, SUB, TABLE, TABLEWRAP, TD, TH } from '../../lib/tokens';
import { Pagination } from '../../components/list-controls';
import { TableEmpty } from '../../components/EmptyState';

// Jump range label, e.g. Bronze (1.20–1.30m). World Cup has no range.
const divRange = (d) => {
  const lo = d.min === null || d.min === undefined ? null : Number(d.min);
  const hi = d.max === null || d.max === undefined ? null : Number(d.max);
  if (lo === null && hi === null) return '';
  if (lo === null) return `up to ${(hi / 100).toFixed(2)}m`;
  if (hi === null) return `${(lo / 100).toFixed(2)}m+`;
  return `${(lo / 100).toFixed(2)}–${(hi / 100).toFixed(2)}m`;
};

export default function Standings() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [loading, setLoading] = useState(true);

  // Table stays hidden until a division box is opened (like the series index).
  const [open, setOpen] = useState(null);
  const div = open ?? '';
  const [divs, setDivs] = useState([]);
  const [metric, setMetric] = useState('avg');

  useEffect(() => {
    fetch(`${API}/scoring/active`).then((r) => r.json()).then((j) => {
      const d = j?.data?.params?.divisions;
      setDivs(Array.isArray(d) && d.length ? d : [
        { key: 'development', label: 'Development' }, { key: 'copper', label: 'Copper' },
        { key: 'bronze', label: 'Bronze' }, { key: 'silver', label: 'Silver' },
        { key: 'gold', label: 'Gold' }, { key: 'world_cup', label: 'World Cup' },
      ]);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (open === null) return;
    setLoading(true);
    const p = new URLSearchParams({ limit: '500', min_rounds: '3', metric });
    if (div) p.set('division', div);
    fetch(`${API}/rankings/modelb/combinations?${p}`)
      .then((r) => r.json())
      .then((j) => { setRows(j.data || []); setPage(1); })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [open, div, metric]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((x) =>
      (x.horse || '').toLowerCase().includes(s) || (x.rider || '').toLowerCase().includes(s));
  }, [rows, q]);

  useEffect(() => { setPage(1); }, [q]);

  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, pages);
  const view = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  const openDiv = open !== null ? divs.find((d) => d.key === open) : null;
  return (
    <>
      {open !== null && (
        <div className="mb-1 text-[12px] text-faint">
          <button onClick={() => setOpen(null)} className="text-muted hover:text-white bg-none border-0 p-0 text-[12px] cursor-pointer">Standings</button>
          <span className="mx-1.5">/</span>
          <span className="text-gold">{openDiv?.label || 'Division'}</span>
        </div>
      )}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-[26px] font-extrabold tracking-tight">{open !== null ? (openDiv?.label || 'Division') : 'Standings'}</h1>
        <span className="rounded-full border border-gold/60 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-gold">◦ {metric === 'clear' ? 'Clear rate' : 'Average score'}</span>
      </div>
      <p className={SUB}>{metric === 'clear' ? 'Rider clear rate on each horse — min 3 rounds, rounds column shows sample size.' : 'Average round score per combination — min 3 rounds, rounds column shows sample size.'}</p>
      {open !== null && (
        <div className="flex gap-1 bg-card2 border border-line rounded p-1 overflow-x-auto w-fit mb-4">
          {[['avg', 'Average'], ['clear', 'Clear %']].map(([k, lbl]) => (
            <button key={k} onClick={() => { setMetric(k); setPage(1); }}
              className={`px-3.5 py-[7px] rounded-md text-[13px] whitespace-nowrap cursor-pointer border-0 ${metric === k ? 'bg-card text-gold font-bold' : 'bg-transparent text-muted hover:text-white'}`}>
              {lbl}
            </button>
          ))}
        </div>
      )}
      {open === null && (
      <>
      <h2 className="mb-3 text-[22px] font-extrabold tracking-tight">Divisions</h2>
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        {divs.map((d) => (
          <button key={d.key} onClick={() => { setOpen(d.key); setPage(1); }}
            className="group flex items-center justify-between rounded border border-line bg-card p-4 text-left transition hover:border-gold/50">
            <div>
              <div className={`text-[15px] font-bold ${open === d.key ? 'text-gold' : 'text-white group-hover:text-gold'} leading-tight`}>{d.label}{divRange(d) ? ` (${divRange(d)})` : ''}</div>
              <div className="mt-1 text-[12px] text-muted">Average score</div>
            </div>
            <span className="text-gold transition group-hover:translate-x-0.5">→</span>
          </button>
        ))}
      </div>
      </>
      )}
      {open !== null && (
      <div className="mb-4 flex flex-wrap items-end gap-2.5 rounded border border-line bg-card p-4">
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Search
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Horse or rider…"
            className="rounded border border-line bg-ink px-2.5 py-2 text-[13px] text-body placeholder:text-faint focus:border-gold/60 focus:outline-none" style={{ width: 220 }} /></label>
      </div>
      )}
      {open !== null && (
      <section className={CARD}>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr><th className={TH}>Rank</th><th className={TH}>Combination</th>
            <th className={`${TH} ${NUM}`}>{metric === 'clear' ? 'Clear %' : 'Avg'}</th><th className={`${TH} ${NUM}`}>Rounds</th>
            <th className={`${TH} ${NUM}`}>Best</th></tr></thead>
          <tbody>
            {view.map((x, i) => {
              const rank = (safePage - 1) * perPage + i + 1;
              return (
                <tr key={`${x.horse_id}-${x.rider_id}`}>
                  <td className={rank === 1 && safePage === 1 ? 'rank1' : ''}>#{rank}</td>
                  <td className={TD}>
                    <Link href={`/horses/${x.horse_slug || x.horse_id}`} className="text-white font-semibold">{x.horse}</Link>
                    <span className="text-faint"> × </span>
                    <Link href={`/riders/${x.rider_slug || x.rider_id}`} className="text-white font-semibold">{x.rider}</Link>
                  </td>
                  <td className={`${TD} ${NUM}`}><b className={rank === 1 && safePage === 1 ? 'text-gold' : ''}>{metric === 'clear' ? (x.clear_pct === null || x.clear_pct === undefined ? '–' : `${Number(x.clear_pct).toFixed(0)}%`) : Number(x.avg_round).toFixed(1)}</b></td>
                  <td className={`${TD} ${NUM} text-muted`}>{x.rounds}</td>
                  <td className={`${TD} ${NUM} text-muted`}>{Number(x.best_round).toFixed(1)}</td>
                </tr>
              );
            })}
            {!view.length && (
              loading ? (
                <tr><td colSpan={5} className="px-2 py-4">
                  <span className="flex flex-col gap-2 py-1" aria-hidden="true" aria-label="Loading">
                    {[0, 1, 2].map((i) => <span key={i} className="sk h-3.5 w-full" />)}
                  </span>
                </td></tr>
              ) : (
                <TableEmpty icon="🏆" title="No combinations match" hint="Try a different search." />
              )
            )}
          </tbody>
        </table>
        </div>
        <Pagination page={safePage} pages={pages} setPage={setPage} perPage={perPage} setPerPage={setPerPage} total={filtered.length} />
      </section>
      )}
    </>
  );
}
