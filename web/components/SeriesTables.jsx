'use client';
import DataTable from './DataTable';
import { NUM, TD, TH } from '../lib/tokens';
import { statusBadge } from '../lib/tokens';

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
            {r.rd ? <a href={`/riders/${r.rd.rider_slug || r.rd.id}`} className="text-white hover:text-gold">{r.rider}</a> : r.rider}
            <span className="text-muted"> × </span>
            {r.h ? <a href={`/horses/${r.h.horse_slug || r.h.id}`} className="text-gold hover:underline">{r.horse}</a> : <span className="text-muted">{r.horse}</span>}
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
          <td className={TD}><a href={`/riders/${x.rider_slug || x.rider_id}`} className="text-white font-semibold no-underline hover:text-gold">{x.rider}</a></td>
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
