'use client';
import { useState } from 'react';
import { CARD, LINK, NUM, TABLE, TABLEWRAP, TD, TH, badge, BADGE } from '../lib/tokens';
import { ordinal } from '../lib/eq';

const fmt1 = (v) => (v === null || v === undefined ? '–' : Number(v).toFixed(1));

function placeCell(r) {
  if (r.status === 'eliminated') return <span className={badge(BADGE.red)}>E</span>;
  if (r.status === 'withdrawn') return <span className={badge(BADGE.gray)}>W</span>;
  if (r.status === 'retired') return <span className={badge(BADGE.gray)}>R</span>;
  if (r.status === 'disqualified') return <span className={badge(BADGE.red)}>DQ</span>;
  if (r.finish_place === 1) return <span className={badge(BADGE.goldfill)}>{ordinal(r.finish_place)}</span>;
  return <span className="text-muted">{ordinal(r.finish_place)}</span>;
}

function resultBadge(s) {
  if (s === 'official') return <span className={badge(BADGE.green)}>Official</span>;
  if (s === 'complete') return <span className={badge(BADGE.blue)}>Complete</span>;
  return <span className={badge(BADGE.goldfill)}>Provisional</span>;
}

export default function ClassResults({ groups }) {
  const [open, setOpen] = useState(groups.length ? groups[0].class_id : null);
  if (!groups.length) {
    return <section className={CARD}><p className="text-muted text-sm">No class results recorded for this event.</p></section>;
  }
  return (
    <div className="space-y-3 mb-6">
      {groups.map((g) => {
        const isOpen = open === g.class_id;
        const hasR2x = g.rounds.some((r) => r.round2_faults !== null && r.round2_faults !== undefined);
        const hasJO = g.rounds.some((r) => r.jumpoff_faults !== null && r.jumpoff_faults !== undefined);
        const prize = g.rounds.some((r) => r.prize_money !== null && r.prize_money !== undefined);
        return (
          <section key={g.class_id} className={CARD} style={{ marginBottom: 0 }}>
            <button onClick={() => setOpen(isOpen ? null : g.class_id)}
              className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 text-left bg-none border-0 p-0 cursor-pointer">
              <span className="text-muted text-xs w-4">{isOpen ? '▾' : '▸'}</span>
              {g.class_number && <span className="text-[11px] text-faint font-bold">#{g.class_number}</span>}
              <span className="font-bold text-[14px] text-white">{g.name}</span>
              {g.height_cm && <span className="text-[11px] text-faint">{(Number(g.height_cm) / 100).toFixed(2)}m</span>}
              {g.format && <span className="text-[11px] text-muted">{g.format}</span>}
              {g.class_type && g.class_type !== 'Standard' && (
                <span className={badge(BADGE.blue)}>{g.class_type}</span>
              )}
              {g.sponsor && <span className="text-[11px] text-gold">· {g.sponsor}</span>}
              <span className="flex-1" />
              {resultBadge(g.result_status)}
              <span className="text-[12px] text-muted">{g.rounds.length} rounds · {g.clears} clear</span>
            </button>
            {isOpen && (
              <div className={`${TABLEWRAP} mt-3`}>
              <table className={TABLE}>
                <thead><tr>
                  <th className={TH}>Place</th><th className={TH}>Rider</th><th className={TH}>Horse</th>
                  <th className={`${TH} ${NUM}`}>R1</th><th className={TH}>Time</th>
                  {hasR2x && <th className={`${TH} ${NUM}`}>R2</th>}
                  {hasJO && <th className={`${TH} ${NUM}`}>Jump-off</th>}
                  <th className={`${TH} ${NUM}`}>Points</th>
                  {prize && <th className={`${TH} ${NUM}`}>Prize</th>}
                </tr></thead>
                <tbody>
                  {g.rounds.map((r) => {
                    const dead = r.status !== 'finished';
                    return (
                      <tr key={r.id} className={dead ? 'opacity-50' : ''} title={r.notes || undefined}>
                        <td className={TD}>{placeCell(r)}</td>
                        <td className={TD}><a className={LINK} href={`/riders/${r.rider_id}`}>{r.rider}</a></td>
                        <td className={TD}><a className={LINK} href={`/horses/${r.horse_id}`}>{r.horse}</a></td>
                        <td className={`${TD} ${NUM} ${Number(r.total_faults) === 0 && !dead ? 'text-moss font-bold' : 'text-muted'}`}>
                          {dead ? '–' : fmt1(r.total_faults)}
                        </td>
                        <td className={`${TD} text-muted`}>{r.time_seconds === null || dead ? '–' : `${r.time_seconds}s`}</td>
                        {hasR2x && <td className={`${TD} ${NUM} text-muted`}>{dead ? '–' : fmt1(r.round2_faults)}</td>}
                        {hasJO && <td className={`${TD} ${NUM} text-muted`}>
                          {dead || (r.jumpoff_faults === null && r.jumpoff_time_seconds === null) ? '–'
                            : `${fmt1(r.jumpoff_faults)}${r.jumpoff_time_seconds !== null ? ` / ${r.jumpoff_time_seconds}s` : ''}`}
                        </td>}
                        <td className={`${TD} ${NUM}`}><b className={Number(r.points) > 0 ? 'text-gold' : 'text-faint'}>{r.points ?? 0}</b></td>
                        {prize && <td className={`${TD} ${NUM} text-muted`}>{r.prize_money ?? '–'}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
