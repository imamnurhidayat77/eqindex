'use client';
import Link from 'next/link';
import { statusBadge } from '../lib/tokens';
import DataTable from './DataTable';

const fmtDate = (d) => (d || '').slice(0, 10);
const num = (v, d = 0) => (v === null || v === undefined || v === '' ? d : Number(v));

function placingBadge(place, status) {
  // Classified-but-not-finished (e.g. retired in the JO but officially 2nd):
  // placing first, status code only when unplaced.
  const p = Number(place);
  if (p) {
    const lbl = p === 1 ? '1st' : p === 2 ? '2nd' : p === 3 ? '3rd' : `${p}th`;
    return <span className={statusBadge(lbl)}>{lbl}</span>;
  }
  if (status && status !== 'finished') {
    const code = { eliminated: 'E', retired: 'R', withdrawn: 'W', disqualified: 'DQ' }[status] || '–';
    return <span className="text-faint">{code}</span>;
  }
  return <span className="text-faint">—</span>;
}

// Shared competition-history datatable for horse + rider profiles.
// mode 'horse' → partner column is Rider; mode 'rider' → partner column is Horse.
export default function HistoryTable({ rows, mode }) {
  const partnerKey = mode === 'horse' ? 'rider' : 'horse';
  const cols = ['Date', 'Event Name', 'Class', 'Height', mode === 'horse' ? 'Rider' : 'Horse', 'Jump Faults', 'Time Faults', 'Total Faults', 'Placing', 'Points'];
  return (
    <DataTable
      rows={rows}
      searchKeys={['event_name', 'class_name', mode === 'horse' ? 'rider' : 'horse']}
      placeholder="Filter by event, class, or partner…"
      initialPerPage={15}
      colSpan={10}
      tableMinWidth="900px"
      thead={
        <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
          {cols.map((c, i) => (
            <th key={c} className={`border-b border-line px-3 py-2.5 font-semibold ${i >= 5 ? 'text-right' : ''}`}>{c}</th>
          ))}
        </tr>
      }
      renderRow={(r) => (
        <tr key={r.id} className="border-b border-line/50 last:border-0 hover:bg-white/[0.02]">
          <td className="whitespace-nowrap px-3 py-2.5 text-muted">{fmtDate(r.class_date)}</td>
          <td className="px-3 py-2.5 font-semibold">{r.event_name}</td>
          <td className="px-3 py-2.5 text-slate-200">{r.class_name}</td>
          <td className="whitespace-nowrap px-3 py-2.5 text-muted">{r.height_cm ? `${(num(r.height_cm) / 100).toFixed(2)}m` : '—'}</td>
          <td className="whitespace-nowrap px-3 py-2.5">
            {mode === 'horse'
              ? <Link href={`/riders/${r.rider_slug || r.rider_id}`} className="text-white hover:text-gold">{r[partnerKey]}</Link>
              : <Link href={`/horses/${r.horse_slug || r.horse_id}`} className="text-gold hover:underline">{r[partnerKey]}</Link>}
          </td>
          {/* A completed first round (time recorded) shows its score even when
              the status is retired/eliminated later — same rule as Model B.
              No round on record: '–'. */}
          {r.status !== 'finished' && (r.time_seconds === null || r.time_seconds === undefined) ? (
            <>
              <td className="px-3 py-2.5 text-right text-faint">–</td>
              <td className="px-3 py-2.5 text-right text-faint">–</td>
              <td className="px-3 py-2.5 text-right text-faint">–</td>
            </>
          ) : (
            <>
              <td className={`px-3 py-2.5 text-right font-semibold ${num(r.jump_faults) === 0 ? 'text-mint' : 'text-danger'}`}>{r.jump_faults}</td>
              <td className={`px-3 py-2.5 text-right ${num(r.time_faults) === 0 ? 'text-mint' : 'text-danger'}`}>{num(r.time_faults).toFixed(2)}</td>
              <td className={`px-3 py-2.5 text-right font-bold ${num(r.total_faults) === 0 ? 'text-mint' : 'text-danger'}`}>{num(r.total_faults).toFixed(2)}</td>
            </>
          )}
          <td className="px-3 py-2.5 text-right">{placingBadge(r.finish_place, r.status)}</td>
          <td className="px-3 py-2.5 text-right font-bold tabular-nums text-gold">{r.modelb_score === null || r.modelb_score === undefined ? '–' : Number(r.modelb_score).toFixed(1)}</td>
        </tr>
      )}
    />
  );
}
