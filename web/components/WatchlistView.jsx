'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { API, DEMO_USER } from '../lib/api';
import { CARD, H2, LINK, NUM, SUB, TABLE, TD, TH } from '../lib/tokens';

const TABS = [
  ['all', 'All'], ['horses', 'Horses'], ['riders', 'Riders'],
  ['combos', 'Combinations'], ['events', 'Events'],
];

const trendCls = (t) =>
  t === 'Declining' ? 'text-blood' : t === 'Stable' ? 'text-muted' : 'text-moss';
const trendArrow = (t) => (t === 'Declining' ? '↓' : t === 'Stable' ? '→' : '↑');

function eqCls(eq, rank) {
  if (rank === 1) return 'text-gold';
  if (eq >= 85) return 'text-moss';
  if (eq >= 80) return 'text-sky';
  return 'text-body';
}

function Toggle({ on, onFlip, label }) {
  return (
    <button
      role="switch" aria-checked={on} aria-label={label} onClick={onFlip}
      className={`w-10 h-[22px] rounded-full shrink-0 transition-colors ${on ? 'bg-moss' : 'bg-barbg'}`}
    >
      <span className={`block w-[18px] h-[18px] rounded-full bg-white mt-[2px] transition-all ${on ? 'ml-[20px]' : 'ml-[2px]'}`} />
    </button>
  );
}

export default function WatchlistView({ horses, riders, combos, eventsTop, timeline, insights, recentCount, initialPrefs }) {
  const router = useRouter();
  const [tab, setTab] = useState('all');
  const [sel, setSel] = useState([]); // [{watchId, kind, id, name}]
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState(() => ({
    score: true, ranking: true, results: true, benchmark: false,
    ...(initialPrefs ? {
      score: !!initialPrefs.score_changes, ranking: !!initialPrefs.ranking_movements,
      results: !!initialPrefs.new_results, benchmark: !!initialPrefs.benchmark_changes,
    } : {}),
  }));
  const flip = async (k) => {
    const prev = prefs;
    const next = { ...prev, [k]: !prev[k] };
    setPrefs(next);
    try {
      const res = await fetch(`${API}/alert-prefs`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: DEMO_USER, score_changes: next.score, ranking_movements: next.ranking,
          new_results: next.results, benchmark_changes: next.benchmark,
        }),
      });
      if (!res.ok) setPrefs(prev);
    } catch { setPrefs(prev); }
  };

  const isSel = (watchId) => sel.some((s) => s.watchId === watchId);
  const toggleSel = (row) => setSel((s) =>
    isSel(row.watchId) ? s.filter((x) => x.watchId !== row.watchId) : [...s, row]);

  async function removeIds(ids) {
    setBusy(true);
    await Promise.all(ids.map((id) =>
      fetch(`${API}/watchlist/${id}?user_id=${DEMO_USER}`, { method: 'DELETE' })));
    setSel([]);
    router.refresh();
    setBusy(false);
  }

  async function watchBody(body) {
    setBusy(true);
    await fetch(`${API}/watchlist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: DEMO_USER, ...body }),
    });
    router.refresh();
    setBusy(false);
  }
  const watchCombo = (horseId, riderId) =>
    watchBody({ entity_type: 'combination', horse_id: horseId, rider_id: riderId });
  const watchEvent = (eventId) =>
    watchBody({ entity_type: 'event', entity_id: eventId });

  function exportCsv() {
    const rows = [['type', 'name', 'eq_score', 'clear_pct', 'rounds', 'wins', 'trend']];
    for (const h of horses) rows.push(['horse', h.name, h.eq, h.clear, h.starts, h.wins, h.trend]);
    for (const r of riders) rows.push(['rider', r.name, r.eq, r.clear, r.starts, r.wins, r.trend]);
    for (const c of combos) rows.push(['combination', `${c.horse} x ${c.rider}`, c.score, c.clear, c.rounds, '', c.trend]);
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'watchlist.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const selHorses = sel.filter((s) => s.kind === 'horse');
  const selRiders = sel.filter((s) => s.kind === 'rider');
  const compareHref = selHorses.length === 2 && !selRiders.length
    ? `/comparison?type=horse&a=${selHorses[0].id}&b=${selHorses[1].id}`
    : selRiders.length === 2 && !selHorses.length
      ? `/comparison?type=rider&a=${selRiders[0].id}&b=${selRiders[1].id}` : null;

  const show = (k) => tab === 'all' || tab === k;
  const box = 'w-4 h-4 accent-gold cursor-pointer';

  const changePill = (r) => {
    if (r.place !== null && r.place !== undefined) {
      const good = r.place <= 3;
      return <span className={`text-[11px] font-bold rounded-md px-2 py-[3px] ${good ? 'bg-greenbg text-moss' : 'bg-redbg text-blood'}`}>#{r.place}</span>;
    }
    return <span className={`text-[11px] font-bold rounded-md px-2 py-[3px] ${r.clear ? 'bg-greenbg text-moss' : 'bg-redbg text-blood'}`}>{r.clear ? 'Clear' : `${r.faults ?? '–'} faults`}</span>;
  };

  return (
    <>
      {/* stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        {[
          ['TRACKED HORSES', horses.length, '♞', 'text-moss'],
          ['TRACKED RIDERS', riders.length, '◉', 'text-sky'],
          ['TRACKED COMBINATIONS', combos.length, '🔗', 'text-gold'],
          ['RECENT UPDATES', recentCount, '◷', 'text-muted'],
        ].map(([lbl, n, icon, col]) => (
          <div key={lbl} className="bg-card border border-line rounded-xl p-4">
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-muted tracking-[0.4px] uppercase">{lbl}</span>
              <span className={`${col} text-sm`}>{icon}</span>
            </div>
            <div className="text-[32px] font-extrabold mt-1">{n}</div>
          </div>
        ))}
      </div>

      {/* tabs */}
      <div className="inline-flex gap-1 bg-card border border-line rounded-lg p-1 mb-5">
        {TABS.map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-[7px] rounded-md text-[13px] ${tab === k ? 'bg-card2 text-gold font-semibold' : 'text-muted'}`}>
            {lbl}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-5 items-start">
        <div className="min-w-0">
          {show('horses') && !!horses.length && (
            <>
              <h2 className={H2}>Watched Horses <span className="text-[11px] font-bold bg-greenbg text-moss rounded-full px-2.5 py-[3px] ml-1.5 align-middle">{horses.length} horses</span></h2>
              <section className={CARD}>
                <div className="overflow-x-auto">
                <table className={TABLE}>
                  <thead><tr>
                    <th className={TH}></th><th className={TH}>Horse Name</th>
                    <th className={`${TH} ${NUM}`}>EQ Score</th><th className={`${TH} ${NUM}`}>Current Rank</th>
                    <th className={`${TH} ${NUM}`}>Clear %</th><th className={`${TH} ${NUM}`}>Avg Faults</th>
                    <th className={TH}>Recent Trend</th><th className={TH}>Last Update</th>
                  </tr></thead>
                  <tbody>
                    {horses.map((h) => (
                      <tr key={h.watchId}>
                        <td className={TD}><input type="checkbox" className={box} checked={isSel(h.watchId)} onChange={() => toggleSel({ watchId: h.watchId, kind: 'horse', id: h.id, name: h.name })} /></td>
                        <td className={TD}><a href={`/horses/${h.id}`} className="text-white font-semibold no-underline hover:text-gold transition-colors">{h.name}</a></td>
                        <td className={`${TD} ${NUM}`}><b className={eqCls(h.eq, h.rank)}>{h.eq}</b></td>
                        <td className={`${TD} ${NUM} ${h.rank === 1 ? 'text-gold font-bold' : 'text-muted'}`}>{h.rank ? `#${h.rank}` : '–'}</td>
                        <td className={`${TD} ${NUM} text-muted`}>{Number(h.clear).toFixed(1)}%</td>
                        <td className={`${TD} ${NUM} text-muted`}>{Number(h.avg).toFixed(2)}</td>
                        <td className={`${TD} font-semibold text-[13px] ${trendCls(h.trend)}`}>{trendArrow(h.trend)} {h.trend}</td>
                        <td className={TD}>
                          <div className="text-muted text-[13px]">{h.last}</div>
                          <div className="text-[11px] mt-0.5">
                            <a className={LINK} href={`/horses/${h.id}`}>View</a>
                            <span className="text-faint"> | </span>
                            <button className="text-sky bg-none border-0 p-0 text-[11px] cursor-pointer" onClick={() => removeIds([h.watchId])}>Remove</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </section>
            </>
          )}

          {show('riders') && !!riders.length && (
            <>
              <h2 className={H2}>Watched Riders <span className="text-[11px] font-bold bg-bluebg text-sky rounded-full px-2.5 py-[3px] ml-1.5 align-middle">{riders.length} riders</span></h2>
              <section className={CARD}>
                <div className="overflow-x-auto">
                <table className={TABLE}>
                  <thead><tr>
                    <th className={TH}></th><th className={TH}>Rider Name</th>
                    <th className={`${TH} ${NUM}`}>Performance Score</th><th className={`${TH} ${NUM}`}>Rank</th>
                    <th className={`${TH} ${NUM}`}>Clear %</th><th className={`${TH} ${NUM}`}>Rounds</th>
                    <th className={TH}>Trend</th><th className={TH}>Last Update</th>
                  </tr></thead>
                  <tbody>
                    {riders.map((r) => (
                      <tr key={r.watchId}>
                        <td className={TD}><input type="checkbox" className={box} checked={isSel(r.watchId)} onChange={() => toggleSel({ watchId: r.watchId, kind: 'rider', id: r.id, name: r.name })} /></td>
                        <td className={TD}><a href={`/riders/${r.id}`} className="text-white font-semibold no-underline hover:text-gold transition-colors">{r.name}</a></td>
                        <td className={`${TD} ${NUM}`}><b className={eqCls(r.eq, r.rank)}>{r.eq}</b></td>
                        <td className={`${TD} ${NUM} ${r.rank === 1 ? 'text-gold font-bold' : 'text-muted'}`}>{r.rank ? `#${r.rank}` : '–'}</td>
                        <td className={`${TD} ${NUM} text-muted`}>{Number(r.clear).toFixed(0)}%</td>
                        <td className={`${TD} ${NUM} text-muted`}>{r.starts}</td>
                        <td className={`${TD} font-semibold text-[13px] ${trendCls(r.trend)}`}>{trendArrow(r.trend)} {r.trend}</td>
                        <td className={TD}>
                          <div className="text-muted text-[13px]">{r.last}</div>
                          <div className="text-[11px] mt-0.5">
                            <a className={LINK} href={`/riders/${r.id}`}>View</a>
                            <span className="text-faint"> | </span>
                            <button className="text-sky bg-none border-0 p-0 text-[11px] cursor-pointer" onClick={() => removeIds([r.watchId])}>Remove</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </section>
            </>
          )}

          {show('combos') && !!combos.length && (
            <>
              <h2 className={H2}>Watched Combinations <span className="text-[11px] font-bold bg-goldbg text-gold rounded-full px-2.5 py-[3px] ml-1.5 align-middle">{combos.length} combinations</span></h2>
              <p className={SUB}>Top partnership of each watched horse.</p>
              <section className={CARD}>
                <div className="overflow-x-auto">
                <table className={TABLE}>
                  <thead><tr>
                    <th className={TH}>Combination</th><th className={`${TH} ${NUM}`}>Partnership Score</th>
                    <th className={`${TH} ${NUM}`}>Rounds</th><th className={`${TH} ${NUM}`}>Clear %</th>
                    <th className={`${TH} ${NUM}`}>Avg Faults</th><th className={TH}>Trend</th><th className={TH}></th>
                  </tr></thead>
                  <tbody>
                    {combos.map((c) => (
                      <tr key={c.key}>
                        <td className={TD}>
                          <span className="text-white font-semibold">{c.horse} × {c.rider}</span>
                          {c.watchId && <span className="text-gold text-xs ml-1.5" title="Watched">★</span>}
                        </td>
                        <td className={`${TD} ${NUM}`}><b className={c.score >= 85 ? 'text-gold' : 'text-sky'}>{c.score}</b></td>
                        <td className={`${TD} ${NUM} text-muted`}>{c.rounds}</td>
                        <td className={`${TD} ${NUM} text-muted`}>{Number(c.clear).toFixed(0)}%</td>
                        <td className={`${TD} ${NUM} text-muted`}>{Number(c.avg).toFixed(2)}</td>
                        <td className={`${TD} font-semibold text-[13px] ${trendCls(c.trend)}`}>{trendArrow(c.trend)} {c.trend}</td>
                        <td className={TD}>
                          {c.watchId ? (
                            <button className="text-sky bg-none border-0 p-0 text-[11px] cursor-pointer" onClick={() => removeIds([c.watchId])}>Remove</button>
                          ) : (
                            <button className="text-gold bg-none border-0 p-0 text-[11px] cursor-pointer" disabled={busy} onClick={() => watchCombo(c.horseId, c.riderId)}>+ Watch</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </section>
            </>
          )}

          {show('events') && !!eventsTop.length && (
            <>
              <h2 className={H2}>Tracked Events</h2>
              <p className={SUB}>Events featuring your watched horses and riders.</p>
              <section className={CARD}>
                <table className={TABLE}>
                  <thead><tr>
                    <th className={TH}>Event</th><th className={TH}>Date</th>
                    <th className={`${TH} ${NUM}`}>Tracked Rounds</th><th className={`${TH} ${NUM}`}>Best Place</th><th className={TH}></th>
                  </tr></thead>
                  <tbody>
                    {eventsTop.map((e, i) => (
                      <tr key={i}>
                        <td className={TD}>
                          <b>{e.event}</b>
                          {e.watchId && <span className="text-gold text-xs ml-1.5" title="Watched">★</span>}
                        </td>
                        <td className={`${TD} text-muted`}>{e.when}</td>
                        <td className={`${TD} ${NUM} text-muted`}>{e.rounds}</td>
                        <td className={`${TD} ${NUM} text-muted`}>{e.best ? `#${e.best}` : '–'}</td>
                        <td className={TD}>
                          {e.watchId ? (
                            <button className="text-sky bg-none border-0 p-0 text-[11px] cursor-pointer" onClick={() => removeIds([e.watchId])}>Remove</button>
                          ) : e.eventId ? (
                            <button className="text-gold bg-none border-0 p-0 text-[11px] cursor-pointer" disabled={busy} onClick={() => watchEvent(e.eventId)}>+ Watch</button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          )}

          {/* action bar */}
          <div className="flex flex-wrap gap-2.5 mt-1 mb-2">
            {compareHref ? (
              <a href={compareHref} className="bg-sky text-ink font-semibold rounded-lg px-4 py-2 text-sm no-underline">Compare Selected</a>
            ) : (
              <button disabled title="Select 2 horses or 2 riders to compare" className="bg-sky/40 text-ink/60 font-semibold rounded-lg px-4 py-2 text-sm cursor-not-allowed">Compare Selected</button>
            )}
            <a href="/analytics" className="border border-moss text-moss font-semibold rounded-lg px-4 py-2 text-sm no-underline">View Analytics</a>
            <button onClick={exportCsv} className="bg-card2 border border-line text-body rounded-lg px-4 py-2 text-sm">Export Report</button>
            <button onClick={() => removeIds(sel.map((s) => s.watchId))} disabled={!sel.length || busy}
              className="border border-blood text-blood rounded-lg px-4 py-2 text-sm disabled:opacity-40">
              {busy ? 'Removing…' : `Remove Selected${sel.length ? ` (${sel.length})` : ''}`}
            </button>
          </div>
          {!compareHref && !!sel.length && (
            <p className="text-faint text-xs mb-2">Select exactly 2 horses or 2 riders to enable comparison.</p>
          )}
        </div>

        {/* sidebar */}
        <div className="min-w-0">
          <h2 className={H2}>Recent Performance Changes</h2>
          <div className="relative pl-4 mb-6">
            <div className="absolute left-[3px] top-2 bottom-2 w-px bg-line" />
            <div className="space-y-2.5">
              {timeline.map((r, i) => (
                <div key={i} className="relative bg-card border border-line rounded-xl p-3">
                  <span className="absolute -left-4 top-4 w-[7px] h-[7px] rounded-full bg-moss" />
                  <div className="flex justify-between gap-2 items-baseline">
                    <b className="text-[13px]">{r.entity}</b>
                    <span className="text-[11px] text-faint shrink-0">{r.when}</span>
                  </div>
                  <div className="flex justify-between gap-2 items-center mt-1">
                    <span className="text-muted text-xs">{r.clear ? 'Clear round' : `${r.faults ?? '–'} faults`} · {r.cls || r.event}</span>
                    {changePill(r)}
                  </div>
                </div>
              ))}
              {!timeline.length && <p className="text-faint text-xs">No rounds tracked yet.</p>}
            </div>
          </div>

          <h2 className={H2}>Alert Preferences</h2>
          <section className={CARD}>
            {[
              ['score', 'Score changes', 'Get notified when EQ scores shift'],
              ['ranking', 'Ranking movements', 'Alerts when tracked entities rise or fall'],
              ['results', 'New competition results', 'Notifications immediately after rounds'],
              ['benchmark', 'Benchmark changes', 'Summary alerts of regional circuit updates'],
            ].map(([k, lbl, sub]) => (
              <div key={k} className="flex justify-between items-center gap-3 py-2.5 border-b border-rowline last:border-0">
                <div>
                  <div className="text-[13px] font-semibold">{lbl}</div>
                  <div className="text-[12px] text-muted">{sub}</div>
                </div>
                <Toggle on={!!prefs[k]} onFlip={() => flip(k)} label={lbl} />
              </div>
            ))}
          </section>
        </div>
      </div>

      {/* intelligence */}
      <h2 className={H2}>Watchlist Intelligence</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {insights.map((txt, i) => (
          <div key={i} className="bg-card2 border border-line border-l-2 border-l-gold rounded-xl p-3.5">
            <div className="text-gold text-[11px] font-bold mb-1.5">✨ AI INSIGHT</div>
            <p className="text-muted text-[13px] leading-relaxed">{txt}</p>
          </div>
        ))}
      </div>
    </>
  );
}
