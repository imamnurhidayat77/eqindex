'use client';
import Link from 'next/link';
import { useState } from 'react';
import DataTable from './DataTable';
import { NUM, TD, TH } from '../lib/tokens';
import { statusBadge } from '../lib/tokens';

// Standings scale to any season length: one row per combination, rounds
// expand on demand (a per-round matrix explodes past a handful of events).
export function SeriesStandingsTable({ table }) {
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState('');
  const s = q.trim().toLowerCase();
  const rows = (table || [])
    .filter((r) => !s || `${r.rider} ${r.horse}`.toLowerCase().includes(s));
  return (
    <>
      <div className="mb-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by rider or horse…"
          className="rounded border border-line bg-ink px-2.5 py-2 text-[13px] text-body placeholder:text-faint focus:border-gold/60 focus:outline-none" style={{ width: 240 }} />
      </div>
      <table className="w-full border-collapse text-[13px]">
        <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted">
          <th className="border-b border-line px-3 py-2.5 font-semibold">#</th>
          <th className="border-b border-line px-3 py-2.5 font-semibold">Combination</th>
          <th className="border-b border-line px-3 py-2.5 font-semibold text-right">Total</th>
          <th className="border-b border-line px-3 py-2.5 font-semibold text-right">Counting</th>
          <th className="border-b border-line px-3 py-2.5 font-semibold text-right">Dropped</th>
          <th className="border-b border-line px-3 py-2.5 font-semibold"><span className="sr-only">Detail</span></th>
        </tr></thead>
        <tbody>
          {rows.map((r) => {
            const scores = Object.entries(r.events || {}).sort((a, b) => b[1] - a[1]);
            const nDrop = Number(r.dropped) || 0;
            const isOpen = open === `${r.rider}-${r.horse}`;
            return [
              <tr key={`${r.rider}-${r.horse}`} onClick={() => setOpen(isOpen ? null : `${r.rider}-${r.horse}`)}
                className="border-b border-line/50 last:border-0 hover:bg-white/[0.02] cursor-pointer">
                <td className="px-3 py-2.5"><span className={statusBadge(r.rank === 1 ? '1st' : r.rank === 2 ? '2nd' : r.rank === 3 ? '3rd' : 'stable')}>#{r.rank}</span></td>
                <td className="px-3 py-2.5 font-semibold">
                  {r.rd ? <Link href={`/riders/${r.rd.rider_slug || r.rd.id}`} className="text-white hover:text-gold" onClick={(e) => e.stopPropagation()}>{r.rider}</Link> : r.rider}
                  <span className="text-muted"> × </span>
                  {r.h ? <Link href={`/horses/${r.h.horse_slug || r.h.id}`} className="text-gold hover:underline" onClick={(e) => e.stopPropagation()}>{r.horse}</Link> : <span className="text-muted">{r.horse}</span>}
                </td>
                <td className="px-3 py-2.5 text-right font-extrabold">{r.total}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted">{scores.length - nDrop}/{scores.length}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted">{nDrop || '–'}</td>
                <td className="px-3 py-2.5 text-right text-muted text-[11px]">{isOpen ? '▴' : '▾'}</td>
              </tr>,
              isOpen && (
                <tr key={`${r.rider}-${r.horse}-rounds`}>
                  <td />
                  <td colSpan={5} className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {scores.map(([lbl, pts], i) => {
                        const dropped = i >= scores.length - nDrop;
                        return (
                          <span key={lbl} title={lbl}
                            className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[12px] tabular-nums ${dropped ? 'border-line text-faint line-through' : 'border-gold/40 text-white'}`}>
                            {pts}<span className="max-w-[220px] truncate font-normal opacity-70">{lbl}</span>
                          </span>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
    </>
  );
}

export function SeriesMatrixTable({ table, evLabels, hasDropped }) {
  const searchRows = table.map((r) => ({ ...r, _combo: `${r.rider} ${r.horse}` }));
  return (
    <DataTable
      rows={searchRows}
      searchKeys={['_combo']}
      placeholder="Filter by rider or horse…"
      initialPerPage={15}
      colSpan={99}
      tableMinWidth="720px"
      thead={
        <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
          <th className="border-b border-line px-3 py-2.5 font-semibold">#</th>
          <th className="border-b border-line px-3 py-2.5 font-semibold">Combination</th>
          {evLabels.map((e) => <th key={e} className="border-b border-line px-3 py-2.5 text-right font-semibold">{e}</th>)}
          <th className="border-b border-line px-3 py-2.5 text-right font-semibold">Total</th>
          {hasDropped && <th className="border-b border-line px-3 py-2.5 text-right font-semibold">Dropped</th>}
        </tr>
      }
      renderRow={(r) => (
        <tr key={`${r.rider}-${r.horse}`} className="border-b border-line/50 last:border-0 hover:bg-white/[0.02]">
          <td className="px-3 py-2.5"><span className={statusBadge(r.rank === 1 ? '1st' : r.rank === 2 ? '2nd' : r.rank === 3 ? '3rd' : 'stable')}>#{r.rank}</span></td>
          <td className="px-3 py-2.5 font-semibold">
            {r.rd ? <Link href={`/riders/${r.rd.rider_slug || r.rd.id}`} className="text-white hover:text-gold">{r.rider}</Link> : r.rider}
            <span className="text-muted"> × </span>
            {r.h ? <Link href={`/horses/${r.h.horse_slug || r.h.id}`} className="text-gold hover:underline">{r.horse}</Link> : <span className="text-muted">{r.horse}</span>}
          </td>
          {evLabels.map((e) => (
            <td key={e} className="px-3 py-2.5 text-right tabular-nums text-muted">{r.events?.[e] ?? '–'}</td>
          ))}
          <td className="px-3 py-2.5 text-right font-extrabold">{r.total}</td>
          {hasDropped && <td className="px-3 py-2.5 text-right text-faint">{r.dropped ? `−${r.dropped_pts}` : '–'}</td>}
        </tr>
      )}
    />
  );
}

export function CategoryTable({ rows }) {
  return (
    <DataTable
      rows={rows}
      searchKeys={['rider']}
      placeholder="Filter by rider…"
      initialPerPage={15}
      colSpan={7}
      thead={<tr>
        <th className={TH}>Rank</th><th className={TH}>Rider</th>
        <th className={`${TH} ${NUM}`}>Points</th><th className={`${TH} ${NUM}`}>Podiums</th>
        <th className={`${TH} ${NUM}`}>Win Rate</th><th className={`${TH} ${NUM}`}>Rounds</th><th className={`${TH} ${NUM}`}>Wins</th>
      </tr>}
      renderRow={(x) => (
        <tr key={x.rider_id}>
          <td className={x._rank === 1 ? 'text-gold font-bold' : 'text-muted'}>#{x._rank}</td>
          <td className={TD}><Link href={`/riders/${x.rider_slug || x.rider_id}`} className="text-white font-semibold no-underline hover:text-gold">{x.rider}</Link></td>
          <td className={`${TD} ${NUM}`}><b className={x._rank === 1 ? 'text-gold' : ''}>{x.total_points}</b></td>
          <td className={`${TD} ${NUM} text-muted`}>{x.podiums ?? '–'}</td>
          <td className={`${TD} ${NUM} text-muted`}>{x.win_rate == null ? '–' : `${Number(x.win_rate).toFixed(1)}%`}</td>
          <td className={`${TD} ${NUM} text-muted`}>{x.starts}</td>
          <td className={`${TD} ${NUM} text-muted`}>{x.wins}</td>
        </tr>
      )}
    />
  );
}
