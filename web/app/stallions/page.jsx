'use client';
import { useEffect, useMemo, useState } from 'react';
import { API } from '../../lib/api';
import { CARD, H1, NUM, SUB, TABLE, TABLEWRAP, TD, TH } from '../../lib/tokens';
import { Pagination } from '../../components/list-controls';
import { TableEmpty } from '../../components/EmptyState';

export default function Stallions() {
  const [sort, setSort] = useState('total');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      const p = new URLSearchParams({ limit: '200', sort });
      if (q.trim()) p.set('q', q.trim());
      fetch(`${API}/stallions?${p}`)
        .then((r) => r.json())
        .then((j) => { setRows(j.data || []); setPage(1); })
        .catch(() => setRows([]))
        .finally(() => setLoading(false));
    }, q ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, q]);

  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const safePage = Math.min(page, pages);
  const view = useMemo(() => rows.slice((safePage - 1) * perPage, safePage * perPage), [rows, safePage, perPage]);
  const pct = (v) => (v === null || v === undefined ? '–' : `${Number(v).toFixed(1)}%`);

  return (
    <>
      <h1 className={H1}>Stallions</h1>
      <p className={SUB}>Sire rankings by offspring performance — internal EQIndex per-round scoring (clear 10 + double 5 + placing 5–1, cap 20). Minimum 2 competing offspring to rank.</p>
      <div className="flex flex-wrap items-end gap-2.5 mb-3">
        <div className="flex gap-1 bg-card2 border border-line rounded p-1 overflow-x-auto w-fit">
          {[['total', 'Total points'], ['avg', 'Average / offspring']].map(([k, lbl]) => (
            <button key={k} onClick={() => { setSort(k); setPage(1); }}
              className={`px-3.5 py-[7px] rounded-md text-[13px] whitespace-nowrap cursor-pointer border-0 ${sort === k ? 'bg-card text-gold font-bold' : 'bg-transparent text-muted hover:text-white'}`}>
              {lbl}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Search
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Stallion…"
            className="rounded border border-line bg-ink px-2.5 py-2 text-[13px] text-body placeholder:text-faint focus:border-gold/60 focus:outline-none" style={{ width: 200 }} /></label>
        <span className="ml-auto text-[12px] text-faint">Clear % split by height · % reaching 1.30m+ · best result</span>
      </div>
      <section className={CARD}>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr>
            <th className={TH}>#</th><th className={TH}>Stallion</th>
            <th className={`${TH} ${NUM}`}>Offspring</th>
            <th className={`${TH} ${NUM}`}>Total</th>
            <th className={`${TH} ${NUM}`}>Avg</th>
            <th className={`${TH} ${NUM}`}>Clear %</th>
            <th className={`${TH} ${NUM}`} title="Clear % under 1.20m">&lt;1.20</th>
            <th className={`${TH} ${NUM}`} title="Clear % 1.20–1.30m">1.20–</th>
            <th className={`${TH} ${NUM}`} title="Clear % 1.30m and above">1.30+</th>
            <th className={`${TH} ${NUM}`} title="% of offspring jumping 1.30m or higher">≥1.30 %</th>
            <th className={TH}>Best</th>
          </tr></thead>
          <tbody>
            {view.map((x, i) => {
              const rank = (safePage - 1) * perPage + i + 1;
              return (
                <tr key={x.stallion}>
                  <td className={rank === 1 && safePage === 1 ? 'text-gold font-bold' : 'text-muted'}>#{rank}</td>
                  <td className={TD}><b>{x.stallion}</b></td>
                  <td className={`${TD} ${NUM} text-muted`}>{x.offspring}</td>
                  <td className={`${TD} ${NUM}`}><b className={rank === 1 && safePage === 1 ? 'text-gold' : ''}>{x.total_points}</b></td>
                  <td className={`${TD} ${NUM} text-muted`}>{x.avg_per_offspring}</td>
                  <td className={`${TD} ${NUM} text-moss`}>{pct(x.clear_pct)}</td>
                  <td className={`${TD} ${NUM} text-muted`}>{pct(x.clear_u120)}</td>
                  <td className={`${TD} ${NUM} text-muted`}>{pct(x.clear_120)}</td>
                  <td className={`${TD} ${NUM} text-muted`}>{pct(x.clear_a130)}</td>
                  <td className={`${TD} ${NUM} text-muted`}>{pct(x.pct_reaching_130)}</td>
                  <td className={TD}>{x.best_place ? <span>#{x.best_place} <span className="text-muted text-[12px]">{x.best_horse}</span></span> : <span className="text-faint">—</span>}</td>
                </tr>
              );
            })}
            {!view.length && (
              loading ? (
                <tr><td colSpan={11} className="px-2 py-4">
                  <span className="flex flex-col gap-2 py-1" aria-hidden="true" aria-label="Loading">
                    {[0, 1, 2].map((k) => <span key={k} className="sk h-3.5 w-full" />)}
                  </span>
                </td></tr>
              ) : (
                <TableEmpty icon="🐴" title="No stallions found" hint="Sires appear once offspring with recorded rounds exist (min 2 competing offspring)." />
              )
            )}
          </tbody>
        </table>
        </div>
        <Pagination page={safePage} pages={pages} setPage={setPage} perPage={perPage} setPerPage={setPerPage} total={rows.length} />
      </section>
    </>
  );
}
