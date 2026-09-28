'use client';
import { NUM, TD, TH, badge, BADGE } from '../lib/tokens';
import { ordinal } from '../lib/eq';
import DataTable from './DataTable';

const diffOf = (avg) => {
  const av = Number(avg);
  if (av >= 7) return ['Very High', BADGE.red];
  if (av >= 5) return ['High', BADGE.red];
  if (av >= 3) return ['Medium', BADGE.blue];
  if (av >= 1.5) return ['Moderate', BADGE.gray];
  return ['Low', BADGE.green];
};

const pct1 = (v) => `${Number(v).toFixed(1)}%`;

export function EventDifficultyTable({ rows }) {
  return (
    <DataTable
      rows={rows}
      searchKeys={['class']}
      placeholder="Filter by class…"
      initialPerPage={10}
      colSpan={6}
      thead={<tr><th className={TH}>Class</th><th className={`${TH} ${NUM}`}>Height</th><th className={`${TH} ${NUM}`}>Starters</th><th className={`${TH} ${NUM}`}>Clear %</th><th className={`${TH} ${NUM}`}>Avg Faults</th><th>Difficulty Score</th></tr>}
      renderRow={(c) => {
        const [lbl, cls] = diffOf(c.avg_faults);
        return (
          <tr key={c.class_id}>
            <td className={TD}><b>{c.class}</b></td>
            <td className={`${TD} ${NUM}`}>{c.height_cm ? `${(Number(c.height_cm) / 100).toFixed(2)}m` : '–'}</td>
            <td className={`${TD} ${NUM}`}>{c.starters}</td>
            <td className={`${TD} ${NUM} text-moss`}>{c.clear_pct === null ? '–' : pct1(c.clear_pct)}</td>
            <td className={`${TD} ${NUM}`}>{c.avg_faults === null ? '–' : Number(c.avg_faults).toFixed(1)}</td>
            <td className={TD}><span className={badge(cls)}>{lbl}</span></td>
          </tr>
        );
      }}
    />
  );
}

export function EventCombosTable({ rows }) {
  const ranked = rows.map((p, i) => ({ ...p, _rank: i + 1, _pair: `${p.horse} ${p.rider}` }));
  return (
    <DataTable
      rows={ranked}
      searchKeys={['_pair']}
      placeholder="Filter by horse or rider…"
      initialPerPage={10}
      colSpan={5}
      thead={<tr><th className={TH}>Combination</th><th className={TH}>Rounds</th><th className={`${TH} ${NUM}`}>Clear %</th><th className={`${TH} ${NUM}`}>Avg Faults</th><th>Best Result</th></tr>}
      renderRow={(p) => (
        <tr key={`${p.horse}-${p.rider}`}>
          <td className={TD}><b>{p.horse} + {p.rider}</b></td>
          <td className={TD}>{p.rounds} Round{p.rounds === 1 ? '' : 's'}</td>
          <td className={`${TD} ${NUM} text-moss`}>{pct1(p.clear_pct)}</td>
          <td className={`${TD} ${NUM}`}>{Number(p.avg_faults).toFixed(2)}</td>
          <td className={TD}>{p._rank === 1 ? <span className={badge(BADGE.goldfill)}>{ordinal(p.best_place)} Place</span> : `${ordinal(p.best_place)} Place`}</td>
        </tr>
      )}
    />
  );
}
