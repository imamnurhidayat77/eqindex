import Link from 'next/link';
import { getJSON } from '../../lib/api';
import { BADGE, CARD, H1, H2, LINK, LIVE, NUM, SUB, TABLE, TABLEWRAP, TD, TH, badge } from '../../lib/tokens';
import { trendBadge, shrunkClear } from '../../lib/eq';
import Filters from '../../components/Filters';
import EventCarousel from '../../components/EventCarousel';
import { heightParams } from '../../lib/heights';
import { EmptyState, TableEmpty } from '../../components/EmptyState';
import { StatCard, StatGrid } from '../../components/StatCard';

export const revalidate = 30;

const pct = (v) => `${Number(v).toFixed(1)}%`;
const diffBadge = (d) => {
  if (d === null || d === undefined || !Number.isFinite(Number(d))) return '–';
  const n = Number(d);
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
};

const s = (sp, k) => Array.isArray(sp?.[k]) ? sp[k][0] : sp?.[k];

export default async function Dashboard({ searchParams }) {
  const season = s(searchParams, 'season') || '';
  const region = s(searchParams, 'region') || '';
  const arena = s(searchParams, 'arena') || '';
  const height = s(searchParams, 'height') || '';
  const minRounds = s(searchParams, 'min_rounds') || '0';
  const range = s(searchParams, 'range') || 'all';
  const entity = s(searchParams, 'entity') || 'combination';

  const api = { season, region, arena, min_starts: minRounds, ...heightParams(height) };
  if (range === '12m') {
    const d = new Date(); d.setMonth(d.getMonth() - 12);
    api.since = d.toISOString().slice(0, 10);
  }
  if (range === 'season') {
    const ref = season || '2026-2027';
    api.since = `${ref.slice(0, 4)}-08-01`;
  }
  const qs = new URLSearchParams(Object.entries(api).filter(([, v]) => v !== '' && v != null)).toString();
  const Q = qs ? `?${qs}` : '';

  const [horses, riders, events, upcomingEv, circuit, ptHorses, ptRiders, stats, seriesLeaders] = await Promise.all([
    getJSON(`/rankings/horses?limit=100${Q ? '&' + qs : ''}`),
    getJSON(`/rankings/riders?limit=100${Q ? '&' + qs : ''}`),
    getJSON(`/events?limit=100&has_data=1${Q ? '&' + qs : ''}`),
    getJSON('/events?limit=20&upcoming=1'),
    getJSON(`/trends/circuit${Q}`),
    // Points leaders — all-time ESNZ series points (series classes only),
    // independent of the slice filters above.
    getJSON('/rankings/horses?limit=5&metric=points').catch(() => ({ data: [] })),
    getJSON('/rankings/riders?limit=4&metric=points').catch(() => ({ data: [] })),
    // Exact slice totals (rankings/events lists are paging-capped — never count from them).
    getJSON(`/stats/circuit${Q}`).catch(() => null),
    getJSON('/series/leaders').catch(() => ({ data: [] })),
  ]);
  const current = { season, region, arena, height, min_rounds: minRounds, range, entity };
  const seasons = [...new Set(events.data.map((e) => e.season).filter(Boolean))].sort().reverse();
  const regions = [...new Set(events.data.map((e) => e.region).filter(Boolean))].sort();
  const arenas = [...new Set(events.data.map((e) => e.arena_type).filter(Boolean))].sort();

  const ranked = horses.data
    .map((h) => ({ ...h }))
    .sort((a, b) => Number(b.clear_pct) - Number(a.clear_pct));
  const rankedR = riders.data
    .map((r) => ({ ...r }))
    .sort((a, b) => Number(b.clear_pct) - Number(a.clear_pct));
  const showHorses = entity !== 'rider';
  const showRiders = entity !== 'horse';
  const top5 = showHorses ? (ptHorses.data || []) : [];
  const top4R = showRiders ? (ptRiders.data || []) : [];

  const details = Object.fromEntries(await Promise.all(
    top5.map(async (h) => [h.horse_id, await getJSON(`/horses/${h.horse_slug || h.horse_id}`)])
  ));
  const rDetails = Object.fromEntries(await Promise.all(
    top4R.map(async (r) => [r.rider_id, await getJSON(`/riders/${r.rider_slug || r.rider_id}`)])
  ));

  // circuit totals + deltas (null = no prior month to compare against)
  const m = circuit.data;
  const hasPrev = m.length > 1;
  const last = m[m.length - 1] || {}, prev = hasPrev ? m[m.length - 2] : {};
  const dPct = (a, b) => {
    const na = Number(a), nb = Number(b);
    if (!hasPrev || !Number.isFinite(na) || !Number.isFinite(nb) || nb === 0) return null;
    return ((na - nb) / nb) * 100;
  };
  const clearDelta = (last.clear_pct == null || prev.clear_pct == null)
    ? null : Number(last.clear_pct) - Number(prev.clear_pct);
  const avgBase = dPct(last.avg_faults, prev.avg_faults);
  const avgDelta = avgBase === null ? null : -avgBase;
  // Exact slice totals (null when the API predates /stats/circuit — fall back to the capped slice).
  const totals = stats?.data || null;
  const numOr = (v, fb) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? fb : Number(v));
  const totalRounds = numOr(totals?.rounds, ranked.reduce((st, h) => st + Number(h.starts), 0));
  const totalClears = ranked.reduce((st, h) => st + Number(h.clears), 0);
  const circuitClear = numOr(totals?.clear_pct, totalRounds ? (100 * totalClears / totalRounds) : 0);
  const circuitAvg = numOr(totals?.avg_faults, totalRounds
    ? ranked.reduce((st, h) => st + Number(h.avg_faults) * Number(h.starts), 0) / totalRounds : 0);
  const horsesN = numOr(totals?.horses, ranked.length);
  const ridersN = numOr(totals?.riders, rankedR.length);
  const eventsN = numOr(totals?.events, events.data.length);

  // leaderboards: thin samples can't top a board (min 3 rounds)
  const MINB = 3;
  const prior = totalRounds ? circuitClear / 100 : 0.5;
  const withConf = (rows) => rows
    .filter((x) => Number(x.starts) >= MINB)
    .map((x) => ({ ...x, shrunk: shrunkClear(x.clears, x.starts, prior) }));
  const boardClearH = withConf(ranked)
    .sort((a, b) => b.shrunk - a.shrunk || Number(b.starts) - Number(a.starts)).slice(0, 10);
  const boardFaultH = withConf(ranked)
    .sort((a, b) => Number(a.avg_faults) - Number(b.avg_faults) || Number(b.starts) - Number(a.starts)).slice(0, 10);
  const boardConsH = withConf(ranked)
    .sort((a, b) => Number(b.wins) - Number(a.wins) || Number(b.starts) - Number(a.starts)).slice(0, 10);
  const boardClearR = withConf(rankedR)
    .sort((a, b) => b.shrunk - a.shrunk || Number(b.starts) - Number(a.starts)).slice(0, 10);

  const badgeArrow = (lbl) => (lbl === 'Declining' ? '↓' : lbl === 'Stable' ? '→' : '↑');
  const spark = (k, n = 6) => m.slice(-n).map((x) => Number(x[k]));
  const latestEvents = [...(events.data || [])]
    .filter((e) => (Number(e.class_count || 0) > 0 || Number(e.round_count || 0) > 0 || Number(e.combo_count || 0) > 0)
      && (!e.date_start || new Date(e.date_start) <= new Date()))
    .sort((a, b) => new Date(b.date_start || 0) - new Date(a.date_start || 0))
    .slice(0, 8);
  // Fixtures not yet started (soonest first) — no results yet.
  const upcomingEvents = [...((upcomingEv.data || []))]
    .sort((a, b) => new Date(a.date_start || 0) - new Date(b.date_start || 0))
    .slice(0, 8);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-3.5">
        <div>
          <h1 className={H1}>Equestrian Performance Intelligence</h1>
          <p className={SUB}>Transform competition data into meaningful horse and rider insights. NZ National Circuit.</p>
        </div>
        <div className="flex gap-2.5 items-center shrink-0 pt-1.5"><span className={LIVE}>● NZ CIRCUIT</span><span className="text-muted border border-line rounded-full px-3 py-[5px] text-xs">◷ Data as of {totals?.last_import ? String(totals.last_import).slice(0, 10) : '—'}</span></div>
      </div>

      <Filters current={current} seasons={seasons} regions={regions} arenas={arenas} />

      {!ranked.length && !rankedR.length ? (
        <section className={CARD}>
          <EmptyState
            icon="◌"
            title="No rounds match these filters"
            hint="Try a different season, region or height band."
            action={<Link className={LINK} href="/dashboard">Reset filters →</Link>}
          />
        </section>
      ) : (
        <>
          <h2 className={H2}>Performance Overview</h2>
          <p className={SUB}>High-level circuit metrics and aggregated analytics</p>
          <StatGrid cols={6}>
            {[
              ['Horses Analysed', diffBadge(dPct(last.horses, prev.horses)), false, horsesN.toLocaleString(), spark('horses'), '#FFD700'],
              ['Riders Analysed', diffBadge(dPct(last.riders, prev.riders)), false, ridersN.toLocaleString(), spark('riders'), '#FFD700'],
              ['Competition Rounds', diffBadge(dPct(last.starts, prev.starts)), false, totalRounds.toLocaleString(), spark('starts'), '#FFD700'],
              ['Events Tracked', diffBadge(dPct(last.events, prev.events)), false, eventsN.toLocaleString(), spark('events'), '#FFD700'],
              ['Clear Round Rate', diffBadge(hasPrev ? clearDelta : null), true, pct(circuitClear), spark('clear_pct'), '#00C853'],
              ['Average Faults', diffBadge(hasPrev ? avgDelta : null), true, circuitAvg.toFixed(2), spark('avg_faults'), '#00C853'],
            ].map(([lbl, d, good, big, sp, col]) => (
              <StatCard
                key={lbl}
                label={lbl}
                delta={d}
                tone={d === '–' ? 'faint' : good ? 'mint' : 'gold'}
                pill
                value={big}
                spark={sp}
                sparkColor={col}
              />
            ))}
          </StatGrid>

          <h2 className={H2}>Latest Events</h2>
          <p className={SUB}>Finished competitions with published results — scroll sideways.</p>
          <EventCarousel events={latestEvents} />

          {showHorses && (
            <>
              <h2 className={H2}>Top Horses</h2>
              <p className={SUB}>All-time ESNZ series points · series classes only · ignores slice filters</p>
              <section className={CARD}>
                <div className={TABLEWRAP}>
                <table className={TABLE}>
                  <thead><tr><th className={TH}>Rank</th><th className={TH}>Horse Name</th><th className={`${TH} ${NUM}`}>Points</th><th className={`${TH} ${NUM}`}>Clear %</th><th className={`${TH} ${NUM}`}>Avg Faults</th><th className={`${TH} ${NUM}`}>Rounds</th><th className={TH}>Trend</th></tr></thead>
                  <tbody>
                    {top5.map((h, i) => {
                      const [lbl, cls] = trendBadge(h.clear_pct, (details[h.horse_id].history || []).slice(0, 5));
                      return (
                        <tr key={h.horse_id}>
                          <td className={i === 0 ? 'text-gold font-bold' : ''}>#{i + 1}</td>
                          <td className={TD}><Link href={`/horses/${h.horse_slug || h.horse_id}`} className="text-white font-semibold">{h.horse}</Link></td>
                          <td className={`${TD} ${NUM}`}><b>{Number(h.total_points)}</b></td>
                          <td className={`${TD} ${NUM} text-moss`}>{pct(h.clear_pct)}</td>
                          <td className={`${TD} ${NUM}`}>{Number(h.avg_faults).toFixed(2)}</td>
                          <td className={`${TD} ${NUM}`}>{h.starts}</td>
                          <td className={TD}><span className={badge(BADGE[cls])}>{badgeArrow(lbl)} {lbl}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </section>
            </>
          )}

          {showRiders && (
            <>
              <h2 className={H2}>Top Riders</h2>
              <p className={SUB}>All-time ESNZ series points across all partnerships · ignores slice filters</p>
              <section className={CARD}>
                <div className={TABLEWRAP}>
                <table className={TABLE}>
                  <thead><tr><th className={TH}>Rank</th><th className={TH}>Rider Name</th><th className={`${TH} ${NUM}`}>Points</th><th className={`${TH} ${NUM}`}>Clear %</th><th className={`${TH} ${NUM}`}>Rounds</th><th className={TH}>Best Partnership</th></tr></thead>
                  <tbody>
                    {top4R.map((r, i) => {
                      const best = (rDetails[r.rider_id].partnerships || [])[0];
                      return (
                        <tr key={r.rider_id}>
                          <td className={i === 0 ? 'text-gold font-bold' : ''}>#{i + 1}</td>
                          <td className={TD}><Link href={`/riders/${r.rider_slug || r.rider_id}`} className="text-white font-semibold">{r.rider}</Link></td>
                          <td className={`${TD} ${NUM}`}><b>{Number(r.total_points)}</b></td>
                          <td className={`${TD} ${NUM} text-moss`}>{pct(r.clear_pct)}</td>
                          <td className={`${TD} ${NUM}`}>{r.starts}</td>
                          <td className={TD}>{best ? <Link className={LINK} href={`/horses/${best.horse_slug || best.horse_id}`}>{best.horse}</Link> : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </section>
            </>
          )}

          {(seriesLeaders.data || []).length > 0 && (
            <>
              <h2 className={H2}>Series Leaders</h2>
              <p className={SUB}>Current leader of each official ESNZ series · <Link className={LINK} href="/series">All series →</Link></p>
              <section className={CARD}>
                <div className={TABLEWRAP}>
                <table className={TABLE}>
                  <thead><tr><th className={TH}>Series</th><th className={TH}>Leader</th><th className={`${TH} ${NUM}`}>Points</th><th className={`${TH} ${NUM}`}>Starts</th><th className={`${TH} ${NUM}`}>Classes</th></tr></thead>
                  <tbody>
                    {(seriesLeaders.data || []).map((s) => (
                      <tr key={s.series_key}>
                        <td className={TD}><Link className={LINK} href={`/series/${s.series_key}`}>{s.series_name || s.series_key}</Link></td>
                        <td className={TD}><Link href={`/horses/${s.horse_slug || s.horse_id}`} className="text-white font-semibold">{s.horse}</Link></td>
                        <td className={`${TD} ${NUM}`}><b>{Number(s.total_points)}</b></td>
                        <td className={`${TD} ${NUM}`}>{s.starts}</td>
                        <td className={`${TD} ${NUM} text-muted`}>{s.classes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </section>
            </>
          )}

          <h2 className={H2}>Leaderboards</h2>
          <p className={SUB}>Clear-round leaders across the circuit.</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className={CARD}>
              <div className="flex items-baseline justify-between mb-1">
                <h2 className="text-[15px] font-bold">Top Horses — Clear Round %</h2>
                <Link className={`${LINK} text-[12px]`} href="/horses">Full table →</Link>
              </div>
              <div className={TABLEWRAP}>
              <table className={TABLE}>
                <thead><tr><th className={TH}>#</th><th className={TH}>Horse</th><th className={`${TH} ${NUM}`}>Clear %</th><th className={`${TH} ${NUM}`}>Rounds</th></tr></thead>
                <tbody>
                  {boardClearH.map((h, i) => (
                    <tr key={h.horse_id}>
                      <td className={i === 0 ? 'text-gold font-bold' : 'text-muted'}>#{i + 1}</td>
                      <td className={TD}><Link href={`/horses/${h.horse_slug || h.horse_id}`} className="text-white font-semibold">{h.horse}</Link></td>
                      <td className={`${TD} ${NUM}`}><b>{h.shrunk.toFixed(0)}%</b></td>
                      <td className={`${TD} ${NUM} text-muted`}>{h.starts}</td>
                    </tr>
                  ))}
                  {!boardClearH.length && <TableEmpty icon="🐎" title="Not enough rounds yet" hint="Boards unlock once horses log 3+ rounds in this slice." />}
                </tbody>
              </table>
              </div>
            </section>
            <section className={CARD}>
              <div className="flex items-baseline justify-between mb-1">
                <h2 className="text-[15px] font-bold">Top Horses — Lowest Avg Faults</h2>
                <Link className={`${LINK} text-[12px]`} href="/horses">Full table →</Link>
              </div>
              <div className={TABLEWRAP}>
              <table className={TABLE}>
                <thead><tr><th className={TH}>#</th><th className={TH}>Horse</th><th className={`${TH} ${NUM}`}>Avg Faults</th><th className={`${TH} ${NUM}`}>Rounds</th></tr></thead>
                <tbody>
                  {boardFaultH.map((h, i) => (
                    <tr key={h.horse_id}>
                      <td className={i === 0 ? 'text-gold font-bold' : 'text-muted'}>#{i + 1}</td>
                      <td className={TD}><Link href={`/horses/${h.horse_slug || h.horse_id}`} className="text-white font-semibold">{h.horse}</Link></td>
                      <td className={`${TD} ${NUM}`}><b>{Number(h.avg_faults).toFixed(2)}</b></td>
                      <td className={`${TD} ${NUM} text-muted`}>{h.starts}</td>
                    </tr>
                  ))}
                  {!boardFaultH.length && <TableEmpty icon="🐎" title="Not enough rounds yet" hint="Boards unlock once horses log 3+ rounds in this slice." />}
                </tbody>
              </table>
              </div>
            </section>
            <section className={CARD}>
              <div className="flex items-baseline justify-between mb-1">
                <h2 className="text-[15px] font-bold">Most Wins</h2>
                <Link className={`${LINK} text-[12px]`} href="/horses">Full table →</Link>
              </div>
              <div className={TABLEWRAP}>
              <table className={TABLE}>
                <thead><tr><th className={TH}>#</th><th className={TH}>Horse</th><th className={`${TH} ${NUM}`}>Wins</th><th className={`${TH} ${NUM}`}>Clear %</th></tr></thead>
                <tbody>
                  {boardConsH.map((h, i) => (
                    <tr key={h.horse_id}>
                      <td className={i === 0 ? 'text-gold font-bold' : 'text-muted'}>#{i + 1}</td>
                      <td className={TD}><Link href={`/horses/${h.horse_slug || h.horse_id}`} className="text-white font-semibold">{h.horse}</Link></td>
                      <td className={`${TD} ${NUM}`}><b>{h.wins}</b></td>
                      <td className={`${TD} ${NUM} text-moss`}>{pct(h.clear_pct)}</td>
                    </tr>
                  ))}
                  {!boardConsH.length && <TableEmpty icon="🐎" title="Not enough rounds yet" hint="Boards unlock once horses log 3+ rounds in this slice." />}
                </tbody>
              </table>
              </div>
            </section>
            <section className={CARD}>
              <div className="flex items-baseline justify-between mb-1">
                <h2 className="text-[15px] font-bold">Top Riders — Clear Round %</h2>
                <Link className={`${LINK} text-[12px]`} href="/riders">Full table →</Link>
              </div>
              <div className={TABLEWRAP}>
              <table className={TABLE}>
                <thead><tr><th className={TH}>#</th><th className={TH}>Rider</th><th className={`${TH} ${NUM}`}>Clear %</th><th className={`${TH} ${NUM}`}>Rounds</th></tr></thead>
                <tbody>
                  {boardClearR.map((r, i) => (
                    <tr key={r.rider_id}>
                      <td className={i === 0 ? 'text-gold font-bold' : 'text-muted'}>#{i + 1}</td>
                      <td className={TD}><Link href={`/riders/${r.rider_slug || r.rider_id}`} className="text-white font-semibold">{r.rider}</Link></td>
                      <td className={`${TD} ${NUM}`}><b>{r.shrunk.toFixed(0)}%</b></td>
                      <td className={`${TD} ${NUM} text-muted`}>{r.starts}</td>
                    </tr>
                  ))}
                  {!boardClearR.length && <TableEmpty icon="🏇" title="Not enough rounds yet" hint="Boards unlock once riders log 3+ rounds in this slice." />}
                </tbody>
              </table>
              </div>
            </section>
          </div>

          <h2 className={H2}>Upcoming Events</h2>
          <p className={SUB}>Fixtures on the calendar — results appear here once published.</p>
          <EventCarousel events={upcomingEvents} kind="upcoming" />

        </>
      )}
    </>
  );
}
