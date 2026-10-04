'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { CARD, LINK, NUM, TABLE, TABLEWRAP, TD, TH, badge, BADGE } from '../lib/tokens';
import { ordinal } from '../lib/eq';
import { Pagination } from './list-controls';
import { EmptyState, TableEmpty } from './EmptyState';

const fmt1 = (v) => (v === null || v === undefined ? '–' : Number(v).toFixed(1));

function placeCell(r) {
  if (r.status === 'eliminated') return <span className={badge(BADGE.red)}>E</span>;
  if (r.status === 'withdrawn') return <span className={badge(BADGE.gray)}>W</span>;
  if (r.status === 'retired') return <span className={badge(BADGE.gray)}>R</span>;
  if (r.status === 'disqualified') return <span className={badge(BADGE.red)}>DQ</span>;
  if (r.finish_place === 1) return <span className={badge(BADGE.goldfill)}>{ordinal(r.finish_place)}</span>;
  return <span className="text-muted">{ordinal(r.finish_place)}</span>;
}

export default function ClassResults({ groups }) {
  const [open, setOpen] = useState(groups.length ? groups[0].class_id : null);
  const [cq, setCq] = useState('');
  const [cpage, setCpage] = useState(1);
  const [perPage, setPerPage] = useState(15);
  const [htab, setHtab] = useState(null); // horse | pony (set once groups known)
  const selectClass = (id) => { setOpen(id); setCq(''); setCpage(1); };
  const pickTab = (k) => {
    setHtab(k);
    const list = k === 'pony' ? groups.filter(isPony) : groups.filter((g) => !isPony(g));
    setOpen(list.length ? list[0].class_id : null);
    setCq(''); setCpage(1);
  };
  // Follow the expanded class into view (skip initial mount).
  const openRef = useRef(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    if (open && openRef.current) openRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [open ]);
  const isPony = (g) => /pony/i.test(g.name || '');
  const nPony = groups.filter(isPony).length;
  const showTabs = nPony > 0 && nPony < groups.length;
  const activeTab = !showTabs ? 'all' : (htab || (groups.length && isPony(groups.find((g) => g.class_id === open) || groups[0]) ? 'pony' : 'horse'));
  const visible = activeTab === 'all' ? groups
    : activeTab === 'pony' ? groups.filter(isPony) : groups.filter((g) => !isPony(g));
  if (!groups.length) {
    return (
      <section className={CARD}>
        <EmptyState
          icon="🏟"
          title="No class results recorded"
          hint="Results appear here once the organiser's file is imported and reviewed."
        />
      </section>
    );
  }
  return (
    <div className="space-y-3 mb-6">
      {showTabs && (
        <div className="inline-flex gap-1 bg-card border border-line rounded p-1">
          {[['horse', `Horses (${groups.length - nPony})`], ['pony', `Ponies (${nPony})`]].map(([k, lbl]) => (
            <button key={k} onClick={() => pickTab(k)}
              className={`px-4 py-[7px] rounded-md text-[13px] whitespace-nowrap cursor-pointer border-0 ${activeTab === k ? 'bg-card2 text-gold font-semibold' : 'bg-transparent text-muted hover:text-white'}`}>
              {lbl}
            </button>
          ))}
        </div>
      )}
      {visible.map((g) => {
        const isOpen = open === g.class_id;
        return (
          <section key={g.class_id} ref={isOpen ? openRef : null} className={`${CARD} scroll-mt-20`} style={{ marginBottom: 0 }}>
            <button onClick={() => selectClass(isOpen ? null : g.class_id)}
              className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 text-left bg-none border-0 p-0 cursor-pointer">
              <span className="text-muted text-xs w-4">{isOpen ? '▾' : '▸'}</span>
              {g.class_number && <span className="text-[11px] text-faint font-bold">#{g.class_number}</span>}
              <span className="font-bold text-[14px] text-white">{g.name}</span>
              {g.height_cm && <span className="text-[11px] text-faint">{(Number(g.height_cm) / 100).toFixed(2)}m</span>}
              {g.format && <span className={badge(g.format === 'Two-phase' ? BADGE.goldfill : BADGE.gray)}>{g.format}</span>}
              {g.class_type && g.class_type !== 'Standard' && (
                <span className={badge(BADGE.blue)}>{g.class_type}</span>
              )}
              {(g.surface || g.arena_type) && (
                <span className="text-[11px] text-muted">{[g.arena_type, g.surface].filter(Boolean).join(' · ')}</span>
              )}
              {g.sponsor && <span className="text-[11px] text-gold">· {g.sponsor}</span>}
              <span className="flex-1" />
              <span className="text-[12px] text-muted">{g.rounds.length} rounds · {g.clears} clear</span>
            </button>
            {isOpen && (() => {
              const s = cq.trim().toLowerCase();
              const filtered = s
                ? g.rounds.filter((r) => `${r.rider || ''} ${r.horse || ''}`.toLowerCase().includes(s))
                : g.rounds;
              const pages = Math.max(1, Math.ceil(filtered.length / perPage));
              const safe = Math.min(cpage, pages);
              const view = filtered.slice((safe - 1) * perPage, safe * perPage);
              const finished = g.rounds.filter((r) => r.status === 'finished');
              const clears = finished.filter((r) => r.clear_round).length;
              const clearRate = finished.length ? (100 * clears / finished.length) : 0;
              const avgF = finished.length
                ? finished.reduce((t, r) => t + Number(r.total_faults || 0), 0) / finished.length : 0;
              const bestTime = finished
                .map((r) => Number(r.time_seconds)).filter((t) => Number.isFinite(t));
              return (
              <div className={`${TABLEWRAP} mt-3`}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                {[
                  ['Rounds', String(g.rounds.length)],
                  ['Clear rate', `${clearRate.toFixed(0)}% (${clears}/${finished.length})`],
                  ['Avg faults', avgF.toFixed(2)],
                  ['Best time', bestTime.length ? `${Math.min(...bestTime)}s` : '–'],
                ].map(([l, v]) => (
                  <div key={l} className="rounded bg-card2 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-faint">{l}</div>
                    <div className="text-[15px] font-extrabold text-white">{v}</div>
                  </div>
                ))}
              </div>
              <div className="mb-2">
                <input
                  value={cq} onChange={(e) => { setCq(e.target.value); setCpage(1); }} placeholder="Filter by rider or horse…"
                  className="w-full max-w-[280px] rounded border border-line bg-ink px-2.5 py-1.5 text-[13px] text-white placeholder:text-faint focus:border-gold/60 focus:outline-none"
                />
              </div>
              <table className={TABLE}>
                <thead><tr>
                  <th className={TH}>Place</th><th className={TH}>Rider</th><th className={TH}>Horse</th>
                  <th className={`${TH} ${NUM}`}>Faults</th><th className={TH}>Time</th>
                </tr></thead>
                <tbody>
                  {view.map((r) => {
                    const dead = r.status !== 'finished';
                    return (
                      <tr key={r.id} className={dead ? 'opacity-50' : ''} title={r.notes || undefined}>
                        <td className={TD}>{placeCell(r)}</td>
                        <td className={TD}><Link className={LINK} href={`/riders/${r.rider_slug || r.rider_id}`}>{r.rider}</Link></td>
                        <td className={TD}><Link className={LINK} href={`/horses/${r.horse_slug || r.horse_id}`}>{r.horse}</Link></td>
                        <td className={`${TD} ${NUM} ${Number(r.total_faults) === 0 && !dead ? 'text-moss font-bold' : 'text-muted'}`}>
                          {dead ? '–' : fmt1(r.total_faults)}
                        </td>
                        <td className={`${TD} text-muted`}>{r.time_seconds === null || dead ? '–' : `${r.time_seconds}s`}</td>
                      </tr>
                    );
                  })}
                  {!view.length && (
                    <TableEmpty
                      icon="◌"
                      title="No rounds match this filter"
                      hint="Try a different rider or horse name."
                    />
                  )}
                </tbody>
              </table>
              <Pagination page={safe} pages={pages} setPage={setCpage} perPage={perPage} setPerPage={setPerPage} total={filtered.length} />
              </div>
              );
            })()}
          </section>
        );
      })}
    </div>
  );
}
