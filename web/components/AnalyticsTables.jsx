'use client';
import { NUM, TD, TH } from '../lib/tokens';
import DataTable from './DataTable';

export function ClassDifficultyTable({ rows }) {
  return (
    <DataTable
      rows={rows}
      searchKeys={['event', 'class', 'class_type', 'format']}
      placeholder="Filter by event, class, type…"
      initialPerPage={15}
      colSpan={8}
      tableMinWidth="760px"
      thead={<tr><th className={TH}>Event</th><th className={TH}>Class</th><th className={TH}>Type</th><th className={TH}>Format</th><th className={`${TH} ${NUM}`}>Height</th><th className={`${TH} ${NUM}`}>Starters</th><th className={`${TH} ${NUM}`}>Clear %</th><th className={`${TH} ${NUM}`}>Avg faults</th></tr>}
      renderRow={(c) => (
        <tr key={c.class_id}>
          <td className={TD}>{c.event}</td><td className={TD}>{c.class}</td>
          <td className={TD}>{c.class_type || '–'}</td>
          <td className={TD}>{c.format || '–'}</td>
          <td className={`${TD} ${NUM}`}>{c.height_cm ? `${c.height_cm}cm` : '–'}</td>
          <td className={`${TD} ${NUM}`}>{c.starters}</td>
          <td className={`${TD} ${NUM} text-moss`}>{c.clear_pct === null ? '–' : `${Number(c.clear_pct).toFixed(1)}%`}</td>
          <td className={`${TD} ${NUM}`}>{c.avg_faults === null ? '–' : Number(c.avg_faults).toFixed(2)}</td>
        </tr>
      )}
    />
  );
}

export function HeightProgressTable({ rows }) {
  return (
    <DataTable
      rows={rows}
      searchKeys={['horse']}
      placeholder="Filter by horse…"
      initialPerPage={15}
      colSpan={4}
      thead={<tr><th className={TH}>Horse</th><th className={`${TH} ${NUM}`}>Height</th><th className={`${TH} ${NUM}`}>Starts</th><th className={`${TH} ${NUM}`}>Clear %</th></tr>}
      renderRow={(x, i) => (
        <tr key={`${x.horse_id}-${x.height_cm}-${i}`}>
          <td className={TD}><a href={`/horses/${x.horse_slug || x.horse_id}`} className="text-white font-semibold hover:text-gold transition-colors">{x.horse}</a></td>
          <td className={`${TD} ${NUM}`}>{x.height_cm}cm</td>
          <td className={`${TD} ${NUM}`}>{x.starts}</td>
          <td className={`${TD} ${NUM} text-moss`}>{Number(x.clear_pct).toFixed(1)}%</td>
        </tr>
      )}
    />
  );
}
