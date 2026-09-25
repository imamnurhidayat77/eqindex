'use client';
import { useState } from 'react';
import { CARD, H2, LINK, NUM, TABLE, TABLEWRAP, TD, TH, badge, BADGE } from '../lib/tokens';
import { ordinal } from '../lib/eq';

function placeCell(r) {
  if (r.status === 'eliminated') return <span className={badge(BADGE.red)}>Elim</span>;
  if (r.status === 'withdrawn') return <span className={badge(BADGE.gray)}>WD</span>;
  if (r.status === 'retired') return <span className={badge(BADGE.gray)}>Ret</span>;
  if (r.finish_place === 1) return <span className={badge(BADGE.goldfill)}>{ordinal(r.finish_place)}</span>;
  return <span className="text-muted">{ordinal(r.finish_place)}</span>;
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
        return (
          <section key={g.class_id} className={CARD} style={{ marginBottom: 0 }}>
            <button onClick={() => setOpen(isOpen ? null : g.class_id)}
              className="w-full flex items-center gap-3 text-left bg-none border-0 p-0 cursor-pointer">
              <span className="text-muted text-xs w-4">{isOpen ? '▾' : '▸'}</span>
              <span className="font-bold text-[14px] text-white">{g.name}</span>
              {g.height_cm && <span className="text-[11px] text-faint">{(Number(g.height_cm) / 100).toFixed(2)}m</span>}
              {g.class_type && g.class_type !== 'Standard' && (
                <span className={badge(BADGE.blue)}>{g.class_type}</span>
              )}
              <span className="flex-1" />
              <span className="text-[12px] text-muted">{g.rounds.length} rounds · {g.clears} clear</span>
            </button>
            {isOpen && (
              <div className={`${TABLEWRAP} mt-3`}>
              <table className={TABLE}>
                <thead><tr>
                  <th className={TH}>Place</th><th className={TH}>Rider</th><th className={TH}>Horse</th>
                  <th className={`${TH} ${NUM}`}>Faults</th><th className={TH}>Time</th>
                  <th className={`${TH} ${NUM}`}>Points</th>
                </tr></thead>
                <tbody>
                  {g.rounds.map((r) => {
                    const dead = r.status !== 'finished';
                    return (
                      <tr key={r.id} className={dead ? 'opacity-50' : ''}>
                        <td className={TD}>{placeCell(r)}</td>
                        <td className={TD}><a className={LINK} href={`/riders/${r.rider_id}`}>{r.rider}</a></td>
                        <td className={TD}><a className={LINK} href={`/horses/${r.horse_id}`}>{r.horse}</a></td>
                        <td className={`${TD} ${NUM} ${Number(r.total_faults) === 0 && !dead ? 'text-moss font-bold' : 'text-muted'}`}>
                          {dead ? '–' : Number(r.total_faults).toFixed(1)}
                        </td>
                        <td className={`${TD} text-muted`}>{r.time_seconds === null || dead ? '–' : `${r.time_seconds}s`}</td>
                        <td className={`${TD} ${NUM}`}><b className={Number(r.points) > 0 ? 'text-gold' : 'text-faint'}>{r.points ?? 0}</b></td>
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
