'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { API } from '../../lib/api';
import { CARD, H1, NUM, SUB, TABLE, TD, TH, INP } from '../../lib/tokens';
import { Pagination } from '../../components/list-controls';
import { TableEmpty } from '../../components/EmptyState';

export default function Stallions() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/stallions?limit=500`)
      .then((r) => r.json())
      .then((j) => { setRows(j.data || []); setPage(1); })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((x) => (x.stallion || '').toLowerCase().includes(s));
  }, [rows, q]);

  useEffect(() => { setPage(1); }, [q]);

  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, pages);
  const view = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  return (
    <>
      <h1 className={H1}>Stallions</h1>
      <p className={SUB}>Sires behind the horses on the NZ circuit, ranked by offspring.</p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input className={INP} value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search stallions…" style={{ maxWidth: 320, width: '100%' }} />
      </div>
      <section className={CARD}>
        <div className="overflow-x-auto">
        <table className={TABLE}>
          <thead><tr><th className={TH}>Rank</th><th className={TH}>Stallion</th><th className={`${TH} ${NUM}`}>Offspring</th><th className={`${TH} ${NUM}`}>Starts</th><th className={`${TH} ${NUM}`}>Wins</th><th className={`${TH} ${NUM}`}>Points</th></tr></thead>
          <tbody>
            {view.map((x, i) => {
              const rank = (safePage - 1) * perPage + i + 1;
              return (
                <tr key={x.stallion}>
                  <td className={rank === 1 && safePage === 1 ? 'rank1' : ''}>#{rank}</td>
                  <td className={TD}><Link href={`/stallions/${encodeURIComponent(x.stallion)}`} className="text-white font-semibold">{x.stallion}</Link></td>
                  <td className={`${TD} ${NUM}`}>{x.offspring}</td>
                  <td className={`${TD} ${NUM}`}>{x.starts}</td>
                  <td className={`${TD} ${NUM}`}>{x.wins}</td>
                  <td className={`${TD} ${NUM}`}><b>{Number(x.total_points)}</b></td>
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
                <TableEmpty icon="🏇" title="No stallions found" hint="Try a different search." />
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
