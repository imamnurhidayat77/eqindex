import { getJSON } from '../lib/api';
import { BADGE, CARD, H1, H2, LINK, LIVE, MUT, NUM, SUB, TABLE, TABLEWRAP, TD, TH, badge } from '../lib/tokens';
import { eqScore, trendBadge, consistencyPts } from '../lib/eq';
import { ScoreRing } from '../components/charts';
import { Spark, TrendPanel, BenchChart } from '../components/Graphs';
import Filters from '../components/Filters';
import EventCarousel from '../components/EventCarousel';
import { heightParams } from '../lib/heights';

export const dynamic = 'force-dynamic';

const pct = (v) => `${Number(v).toFixed(1)}%`;
const diffBadge = (d) => `${d > 0 ? '+' : ''}${d.toFixed(1)}%`;

function difficulty(avg) {
  const a = Number(avg);
  if (a >= 5) return ['Elite', 'goldfill'];
  if (a >= 3) return ['High', 'gray'];
  if (a >= 1.5) return ['Medium', 'gray'];
  return ['Low', 'green'];
}

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
    const ref = season || '2025-2026';
    api.since = `${ref.slice(0, 4)}-08-01`;
  }
  const qs = new URLSearchParams(Object.entries(api).filter(([, v]) => v !== '' && v != null)).toString();
  const Q = qs ? `?${qs}` : '';

  const [horses, riders, events, circuit, classes, heights] = await Promise.all([
    getJSON(`/rankings/horses?limit=100${Q ? '&' + qs : ''}`),
    getJSON(`/rankings/riders?limit=100${Q ? '&' + qs : ''}`),
    getJSON(`/events?limit=100${Q ? '&' + qs : ''}`),
    getJSON(`/trends/circuit${Q}`),
    getJSON(`/classes?limit=100${Q ? '&' + qs : ''}`),
    getJSON('/height-stats?limit=200'),
  ]);
  const current = { season, region, arena, height, min_rounds: minRounds, range, entity };
  const seasons = [...new Set(events.data.map((e) => e.season).filter(Boolean))].sort().reverse();
  const regions = [...new Set(events.data.map((e) => e.region).filter(Boolean))].sort();
  const arenas = [...new Set(events.data.map((e) => e.arena_type).filter(Boolean))].sort();

  const ranked = horses.data
    .map((h) => ({ ...h, eq: eqScore(h.clear_pct, h.avg_faults, h.starts) }))
    .sort((a, b) => b.eq - a.eq || Number(b.clear_pct) - Number(a.clear_pct));
  const rankedR = riders.data
    .map((r) => ({ ...r, eq: eqScore(r.clear_pct, r.avg_faults, r.starts) }))
    .sort((a, b) => b.eq - a.eq);
  const showHorses = entity !== 'rider';
  const showRiders = entity !== 'horse';
  const top5 = showHorses ? ranked.slice(0, 5) : [];
  const top4R = showRiders ? rankedR.slice(0, 4) : [];

  const details = Object.fromEntries(await Promise.all(
    top5.map(async (h) => [h.horse_id, await getJSON(`/horses/${h.horse_id}`)])
  ));
  const rDetails = Object.fromEntries(await Promise.all(
    top4R.map(async (r) => [r.rider_id, await getJSON(`/riders/${r.rider_id}`)])
  ));

  const feat = top5[0];
  const fPart = feat ? (details[feat.horse_id].partnerships || [])[0] : null;
  const fTrend = feat ? await getJSON(`/horses/${feat.horse_id}/trend`) : { data: [] };
  const fHeights = feat ? heights.data.filter((x) => x.horse_id === feat.horse_id) : [];
  const bestH = [...fHeights].sort((a, b) =>
    Number(b.clear_pct) - Number(a.clear_pct) || Number(b.height_cm) - Number(a.height_cm))[0];
  const fMonths = fTrend.data;
  const seasonDelta = fMonths.length > 1
    ? Number(fMonths[fMonths.length - 1].clear_pct) - Number(fMonths[0].clear_pct) : 0;

  // circuit totals + deltas
  const m = circuit.data;
  const last = m[m.length - 1] || {}, prev = m[m.length - 2] || last;
  const dPct = (a, b) => b ? ((Number(a) - Number(b)) / Number(b)) * 100 : 0;
  const totalRounds = ranked.reduce((st, h) => st + Number(h.starts), 0);
  const totalClears = ranked.reduce((st, h) => st + Number(h.clears), 0);
  const circuitClear = totalRounds ? (100 * totalClears / totalRounds) : 0;
  const circuitAvg = totalRounds
    ? ranked.reduce((st, h) => st + Number(h.avg_faults) * Number(h.starts), 0) / totalRounds : 0;
  const avgs = ranked.map((h) => Number(h.avg_faults));
  const circuitStd = Math.sqrt(avgs.reduce((st, v) => st + (v - circuitAvg) ** 2, 0) / Math.max(avgs.length, 1));

  // trending: biggest recent-form improvement
  const trending = top5.map((h) => {
    const hist = (details[h.horse_id].history || []).slice(0, 5);
    const last5 = hist.length ? 100 * hist.filter((r) => r.clear_round).length / hist.length : 0;
    return { h, diff: last5 - Number(h.clear_pct), n: hist.length };
  }).sort((a, b) => b.diff - a.diff).slice(0, 3);

  // competition intel: top 3 events by volume
  const byEvent = {};
  for (const c of classes.data) {
    (byEvent[c.event] ||= { rounds: 0, cp: [], af: [] });
    byEvent[c.event].rounds += Number(c.starters) || 0;
    if (c.clear_pct !== null) byEvent[c.event].cp.push(Number(c.clear_pct));
    if (c.avg_faults !== null) byEvent[c.event].af.push(Number(c.avg_faults));
  }
  const intel = Object.entries(byEvent)
    .map(([event, v]) => ({
      event,
      clear: v.cp.length ? v.cp.reduce((a, b) => a + b, 0) / v.cp.length : 0,
      avg: v.af.length ? v.af.reduce((a, b) => a + b, 0) / v.af.length : 0,
    }))
    .sort((a, b) => b.clear - a.clear).slice(0, 3);

  const badgeArrow = (lbl) => (lbl === 'Declining' ? '↓' : lbl === 'Stable' ? '→' : '↑');
  const spark = (k, n = 6) => m.slice(-n).map((x) => Number(x[k]));
  const insight = (t) => {
    const w = Number(t.h.wins);
    if (t.diff > 10) return `Improved consistency over last ${t.n} competitions.`;
    if (w > 0) return `${w} win${w === 1 ? '' : 's'} from ${t.h.starts} starts this season.`;
    return `Holding a ${pct(t.h.clear_pct)} clear rate.`;
  };
  const latestEvents = [...(events.data || [])]
    .sort((a, b) => new Date(b.date_start || 0) - new Date(a.date_start || 0))
    .slice(0, 8);

  const consistencyWord = feat
    ? (Number(feat.faults_stddev) <= 2 ? 'exceptional'
      : Number(feat.faults_stddev) <= 4 ? 'strong' : 'developing') : '';

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-3.5">
        <div>
          <h1 className={H1}>Equestrian Performance Intelligence</h1>
          <p className={SUB}>Transform competition data into meaningful horse and rider insights. NZ National Circuit.</p>
        </div>
        <div className="flex gap-2.5 items-center shrink-0 pt-1.5"><span className={LIVE}>● LIVE FEED</span><span className="text-muted border border-line rounded-full px-3 py-[5px] text-xs">◷ Updated just now</span></div>
      </div>

      <Filters current={current} seasons={seasons} regions={regions} arenas={arenas} />

      {!ranked.length && !rankedR.length ? (
        <section className={CARD}><p className={MUT}>No rounds match these filters. <a href="/">Reset Filters</a></p></section>
      ) : (
        <>
          <h2 className={H2}>Performance Overview</h2>
          <p className={SUB}>High-level circuit metrics and aggregated analytics</p>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
            {[
              ['HORSES ANALYSED', diffBadge(dPct(last.horses, prev.horses)), false, ranked.length, spark('horses'), '#FFD700'],
              ['RIDERS ANALYSED', diffBadge(dPct(last.riders, prev.riders)), false, rankedR.length, spark('riders'), '#FFD700'],
              ['COMPETITION ROUNDS', diffBadge(dPct(last.starts, prev.starts)), false, totalRounds.toLocaleString(), spark('starts'), '#FFD700'],
              ['EVENTS TRACKED', diffBadge(dPct(last.events, prev.events)), false, events.data.length, spark('events'), '#FFD700'],
              ['CLEAR ROUND RATE', diffBadge(Number(last.clear_pct) - Number(prev.clear_pct)), true, pct(circuitClear), spark('clear_pct'), '#00C853'],
              ['AVERAGE FAULTS', diffBadge(-dPct(last.avg_faults, prev.avg_faults)), true, circuitAvg.toFixed(2), spark('avg_faults'), '#00C853'],
            ].map(([lbl, d, good, big, sp, col]) => (
              <div className="bg-card border border-line rounded p-3.5 px-4" key={lbl}>
                <div className="flex justify-between items-baseline gap-2"><span className="text-[11px] text-muted tracking-[0.4px] uppercase">{lbl}</span><span className={`font-bold whitespace-nowrap ${good ? 'text-moss' : 'text-gold'}`}>{d}</span></div>
                <div className="text-[30px] font-extrabold mt-1.5 flex items-end justify-between">{big}<Spark data={sp} color={col} /></div>
              </div>
            ))}
          </div>

          {feat && (
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
              <section className={CARD}>
                <h2 className={H2}>🎖 Featured Horse Intelligence</h2>
                <div className="flex gap-5 items-center my-3">
                  <ScoreRing score={feat.eq} />
                  <div>
                    <div className="text-[22px] font-extrabold">{feat.horse}</div>
                    <div className="flex gap-6 mt-1.5">
                      <div><div className="text-[11px] text-muted">Rider</div><b className="text-[13px] text-white">{fPart ? fPart.rider : '—'}</b></div>
                      <div><div className="text-[11px] text-muted">Owner</div><b className="text-[13px] text-white">{details[feat.horse_id].data.breeder || 'Private ownership'}</b></div>
                    </div>
                  </div>
                  <div className="flex-1" />
                  <span className="inline-block text-[11px] font-bold rounded-md px-2 py-[3px] border border-gold text-gold">Elite Performance</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 my-3.5">
                  <div className="bg-card2 rounded p-2.5 px-3"><div className="text-[11px] text-muted">Clear Round Rate</div><div className="text-[15px] font-bold mt-0.5 text-moss">{pct(feat.clear_pct)}</div></div>
                  <div className="bg-card2 rounded p-2.5 px-3"><div className="text-[11px] text-muted">Average Faults</div><div className="text-[15px] font-bold mt-0.5 text-moss">{Number(feat.avg_faults).toFixed(2)}</div></div>
                  <div className="bg-card2 rounded p-2.5 px-3"><div className="text-[11px] text-muted">Rounds Analysed</div><div className="text-[15px] font-bold mt-0.5 text-sky">{feat.starts}</div></div>
                  <div className="bg-card2 rounded p-2.5 px-3"><div className="text-[11px] text-muted">Season Trend</div><div className="text-[15px] font-bold mt-0.5 text-gold">{diffBadge(seasonDelta)}</div></div>
                </div>
                <div className="bg-card2 rounded p-3 px-3.5 text-muted italic text-[13px]">“{feat.horse} shows {consistencyWord} consistency across recent competitions, with strong performance in {bestH ? `${bestH.height_cm}cm` : 'medium height'} classes.”</div>
              </section>
              <section className={CARD}>
                <h2 className={H2}>🔗 Best Partnership</h2>
                <div className="flex justify-between items-center my-2.5">
                  <div><b>{fPart ? `${feat.horse} + ${fPart.rider}` : '—'}</b><div className="text-xs text-muted">Cohesive intelligence analysis</div></div>
                  <div className="text-right"><b className="text-gold text-[18px]">{fPart ? eqScore(fPart.clear_pct, fPart.avg_faults, fPart.rounds_together) : '—'}/100</b><div className="text-[10px] text-muted">EQ MATCH</div></div>
                </div>
                {fPart && <>
                  <div className="flex justify-between py-[9px] border-b border-rowline last:border-0 text-sm"><span className="text-muted">Rounds Together</span><span className="font-semibold">{fPart.rounds_together} Rounds</span></div>
                  <div className="flex justify-between py-[9px] border-b border-rowline last:border-0 text-sm"><span className="text-muted">Clear Rate Together</span><span className="font-semibold text-moss">{pct(fPart.clear_pct)}</span></div>
                  <div className="flex justify-between py-[9px] border-b border-rowline last:border-0 text-sm"><span className="text-muted">Average Faults</span><span className="font-semibold">{Number(fPart.avg_faults).toFixed(2)}</span></div>
                  <div className="flex justify-between py-[9px] border-b border-rowline last:border-0 text-sm"><span className="text-muted">Best Height Class</span><span className="font-semibold">{bestH ? `${(Number(bestH.height_cm) / 100).toFixed(2)}m` : '—'}</span></div>
                </>}
                <div className="text-[11px] text-faint mt-2.5">*EQIndex analyses composite team dynamics, evaluating rider positioning offset against horse landing trajectories.</div>
              </section>
            </div>
          )}

          {feat && (
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
              <section className={CARD}>
                <h2 className={H2}>Season Performance Trend</h2>
                <p className={SUB}>Temporal metrics comparison for featured class</p>
                <TrendPanel monthly={fMonths} horseName={feat.horse} eq={feat.eq} />
              </section>
              <section className={CARD}>
                <h2 className={H2}>Performance Benchmarking</h2>
                <p className={SUB}>{feat.horse} vs. Showjumping Circuit Avg</p>
                <BenchChart items={[
                  { label: 'Clear Round Rate', short: feat.horse.split(' ')[0] + ' S.', mine: feat.clear_pct, avg: circuitClear, text: `${pct(feat.clear_pct)} vs ${pct(circuitClear)}`, color: '#00C853' },
                  { label: 'Average Faults (Lower is Better)', short: feat.horse.split(' ')[0] + ' S.', mine: feat.avg_faults, avg: circuitAvg, text: `${Number(feat.avg_faults).toFixed(2)} vs ${circuitAvg.toFixed(2)}`, color: '#FF1744' },
                  { label: 'Consistency Score', short: feat.horse.split(' ')[0] + ' S.', mine: consistencyPts(feat.faults_stddev), avg: consistencyPts(circuitStd), text: `${consistencyPts(feat.faults_stddev)}pts vs ${consistencyPts(circuitStd)}pts`, color: '#FFD700' },
                ]} />
              </section>
            </div>
          )}

          <h2 className={H2}>Latest Events</h2>
          <p className={SUB}>Newest competitions on the circuit — scroll sideways.</p>
          <EventCarousel events={latestEvents} />

          {showHorses && (
            <>
              <h2 className={H2}>Top Horses</h2>
              <p className={SUB}>Leading equine ranking across New Zealand heights class</p>
              <section className={CARD}>
                <div className={TABLEWRAP}>
                <table className={TABLE}>
                  <thead><tr><th className={TH}>Rank</th><th className={TH}>Horse Name</th><th className={`${TH} ${NUM}`}>EQ Score</th><th className={`${TH} ${NUM}`}>Clear %</th><th className={`${TH} ${NUM}`}>Avg Faults</th><th className={`${TH} ${NUM}`}>Rounds</th><th className={TH}>Trend</th></tr></thead>
                  <tbody>
                    {top5.map((h, i) => {
                      const [lbl, cls] = trendBadge(h.clear_pct, (details[h.horse_id].history || []).slice(0, 5));
                      return (
                        <tr key={h.horse_id}>
                          <td className={i === 0 ? 'text-gold font-bold' : ''}>#{i + 1}</td>
                          <td className={TD}><a href={`/horses/${h.horse_id}`} className="text-white font-semibold">{h.horse}</a></td>
                          <td className={`${TD} ${NUM}`}><b>{h.eq}</b></td>
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
              <p className={SUB}>Leading national showjumping athletes calculated by circuit performance index</p>
              <section className={CARD}>
                <div className={TABLEWRAP}>
                <table className={TABLE}>
                  <thead><tr><th className={TH}>Rank</th><th className={TH}>Rider Name</th><th className={`${TH} ${NUM}`}>Performance Score</th><th className={`${TH} ${NUM}`}>Clear %</th><th className={`${TH} ${NUM}`}>Rounds</th><th className={TH}>Best Partnership</th></tr></thead>
                  <tbody>
                    {top4R.map((r, i) => {
                      const best = (rDetails[r.rider_id].partnerships || [])[0];
                      return (
                        <tr key={r.rider_id}>
                          <td className={i === 0 ? 'text-gold font-bold' : ''}>#{i + 1}</td>
                          <td className={TD}><a href={`/riders/${r.rider_id}`} className="text-white font-semibold">{r.rider}</a></td>
                          <td className={`${TD} ${NUM}`}><b>{r.eq}</b></td>
                          <td className={`${TD} ${NUM} text-moss`}>{pct(r.clear_pct)}</td>
                          <td className={`${TD} ${NUM}`}>{r.starts}</td>
                          <td className={TD}>{best ? <a className={LINK} href={`/horses/${best.horse_id}`}>{best.horse}</a> : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </section>
            </>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h2 className={H2}>Trending Horses</h2>
              <p className={SUB}>Steeds with highest rate of consistency gain over 5 rounds</p>
              <section className={CARD}>
                <div className={TABLEWRAP}>
                <table className={TABLE}>
                  <thead><tr><th className={TH}>Horse</th><th className={`${TH} ${NUM}`}>EQ Score</th><th className={TH}>Recent Insight</th></tr></thead>
                  <tbody>
                    {trending.map((t) => (
                      <tr key={t.h.horse_id}>
                        <td className={TD}><b>{t.h.horse}</b></td><td className={`${TD} ${NUM} text-gold`}><b>{t.h.eq}</b></td>
                        <td className={MUT}>{insight(t)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </section>
            </div>
            <div>
              <h2 className={H2}>Competition Intelligence</h2>
              <p className={SUB}>Historical complexity profiles of NZ regional arenas</p>
              <section className={CARD}>
                <div className={TABLEWRAP}>
                <table className={TABLE}>
                  <thead><tr><th className={TH}>Event</th><th className={TH}>Difficulty</th><th className={`${TH} ${NUM}`}>Clear %</th></tr></thead>
                  <tbody>
                    {intel.map((x) => {
                      const [lbl, cls] = difficulty(x.avg);
                      return (
                        <tr key={x.event}>
                          <td className={TD}><b>{x.event}</b></td><td className={TD}><span className={badge(BADGE[cls])}>{lbl}</span></td>
                          <td className={`${TD} ${NUM} text-moss`}>{pct(x.clear)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}
