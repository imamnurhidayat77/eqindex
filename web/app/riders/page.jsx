'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { API } from '../../lib/api';
import { CARD, H1, NUM, SUB, TABLE, TD, TH } from '../../lib/tokens';
import { Pagination } from '../../components/list-controls';
import { TableEmpty } from '../../components/EmptyState';

export default function Riders() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const perPage = 25;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/rankings/modelb/riders?limit=500`)
      .then((r) => r.json())
      .then((j) => { setRows(j.data || []); setPage(1); })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((x) => (x.rider || '').toLowerCase().includes(s));
  }, [rows, q]);

  useEffect(() => { setPage(1); }, [q]);

  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, pages);
  const view = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  return (
    <>
      <h1 className={H1}>Riders</h1>
      <p className={SUB}>Form rating — every ranked rider on the NZ circuit.</p>
      <div className="mb-3 flex flex-wrap items-end gap-2.5 rounded border border-line bg-card p-4">
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Search
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rider…"
            className="rounded border border-line bg-ink px-2.5 py-2 text-[13px] text-body placeholder:text-faint focus:border-gold/60 focus:outline-none" style={{ width: 200 }} /></label>
        <span className="ml-auto text-[12px] text-faint">Best-12 · min 20 rounds to rank · <Link href="/standings" className="text-sky no-underline hover:underline">Combination standings →</Link></span>
      </div>
      <section className={CARD}>
        <div className="overflow-x-auto">
        <table className={TABLE}>
          <thead><tr><th className={TH}>Rank</th><th className={TH}>Rider</th>
            <th className={`${TH} ${NUM}`}>Rating</th><th className={`${TH} ${NUM}`}>Horses</th><th className={`${TH} ${NUM}`}>Rounds</th><th className={TH}>Form</th></tr></thead>
          <tbody>
            {view.map((x, i) => {
              const rank = (safePage - 1) * perPage + i + 1;
              return (
                <tr key={x.rider_id}>
                  <td className={rank === 1 && safePage === 1 ? 'rank1' : ''}>{!x.eligible ? '–' : `#${rank}`}</td>
                  <td className={TD}><Link href={`/riders/${x.rider_slug || x.rider_id}`} className="text-white font-semibold">{x.rider}</Link></td>
                  <td className={`${TD} ${NUM}`}><b className={rank === 1 && safePage === 1 && x.eligible ? 'text-gold' : ''}>{x.eligible ? Number(x.best12).toFixed(1) : '–'}</b></td>
                  <td className={`${TD} ${NUM} text-muted`}>{x.horses_ridden}</td>
                  <td className={`${TD} ${NUM} text-muted`}>{x.rounds}</td>
                  <td className={`${TD} text-muted text-[12px]`}>{x.eligible ? (x.form_score === null ? '' : `form ${Number(x.form_score).toFixed(1)}`) : `needs ${Math.max(1, 20 - Number(x.rounds || 0))} more rounds to rank`}</td>
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
        <Pagination page={safePage} pages={pages} setPage={setPage} perPage={perPage} total={filtered.length} />
      </section>
    </>
  );
}
