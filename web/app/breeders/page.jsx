'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { API } from '../../lib/api';
import { CARD, H1, NUM, SUB, TABLE, TD, TH, INP } from '../../lib/tokens';
import { Pagination } from '../../components/list-controls';
import { TableEmpty } from '../../components/EmptyState';

export default function Breeders() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('horses');

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/breeders?limit=500`)
      .then((r) => r.json())
      .then((j) => { setRows(j.data || []); setPage(1); })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const key = sortBy === 'points' ? 'total_points' : sortBy;
    const sorted = [...rows].sort((a, b) => Number(b[key] || 0) - Number(a[key] || 0)
      || Number(b.horses || 0) - Number(a.horses || 0));
    if (!s) return sorted;
    return sorted.filter((x) => (x.breeder || '').toLowerCase().includes(s));
  }, [rows, q, sortBy]);

  useEffect(() => { setPage(1); }, [q, sortBy]);

  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, pages);
  const view = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  return (
    <>
      <h1 className={H1}>Breeders</h1>
      <p className={SUB}>Breeding programs behind the horses on the NZ circuit.</p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input className={INP} value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search breeders…" aria-label="Search breeders" style={{ maxWidth: 320, width: '100%' }} />
        <div className="flex gap-1 bg-card2 border border-line rounded p-1 w-fit" role="group" aria-label="Sort breeders">
          {[['horses', 'Most horses'], ['points', 'Most points'], ['wins', 'Most wins']].map(([k, lbl]) => (
            <button key={k} onClick={() => setSortBy(k)} aria-pressed={sortBy === k}
              className={`px-3 py-[6px] rounded-md text-[13px] whitespace-nowrap cursor-pointer border-0 ${sortBy === k ? 'bg-card text-gold font-bold' : 'bg-transparent text-muted hover:text-white'}`}>
              {lbl}
            </button>
          ))}
        </div>
      </div>
      <section className={CARD}>
        <div className="overflow-x-auto">
        <table className={TABLE}>
          <thead><tr><th className={TH}>#</th><th className={TH}>Breeder</th><th className={`${TH} ${NUM}`}>Horses</th><th className={`${TH} ${NUM}`}>Starts</th><th className={`${TH} ${NUM}`}>Wins</th><th className={`${TH} ${NUM}`}>Points</th></tr></thead>
          <tbody>
            {view.map((x, i) => {
              const rank = (safePage - 1) * perPage + i + 1;
              return (
                <tr key={x.breeder}>
                  <td className={rank === 1 && safePage === 1 ? 'rank1' : ''}>#{rank}</td>
                  <td className={TD}><Link href={`/breeders/${encodeURIComponent(x.breeder)}`} className="text-white font-semibold">{x.breeder}</Link></td>
                  <td className={`${TD} ${NUM}`}>{x.horses}</td>
                  <td className={`${TD} ${NUM}`}>{x.starts}</td>
                  <td className={`${TD} ${NUM}`}>{x.wins}</td>
                  <td className={`${TD} ${NUM}`}><b>{Number(x.total_points)}</b></td>
                </tr>
              );
            })}
            {!view.length && (
              loading && !rows.length ? (
                <tr><td colSpan={6} className="px-2 py-4">
                  <span className="flex flex-col gap-2 py-1" aria-hidden="true" aria-label="Loading">
                    {[0, 1, 2].map((i) => <span key={i} className="sk h-3.5 w-full" />)}
                  </span>
                </td></tr>
              ) : (
                <TableEmpty icon="🏇" title="No breeders found" hint="Try a different search." />
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
