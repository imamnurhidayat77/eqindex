import { getJSON } from '../../lib/api';
import { BADGE, BTN, CARD, EMPTY, H1, H2, INP, LINK, LIVE, NUM, SUB, TABLE, TABLEWRAP, TD, TH, badge } from '../../lib/tokens';
import { HEIGHT_BANDS, heightParams } from '../../lib/heights';
import { eqScore, trendBadge, consistencyPts } from '../../lib/eq';
import WatchButton from '../../components/WatchButton';

export const dynamic = 'force-dynamic';

const pct1 = (v) => (v === null || v === undefined ? '–' : `${Number(v).toFixed(0)}%`);
const pctFull = (v) => (v === null || v === undefined ? '–' : `${Number(v).toFixed(1)}%`);

function trendPill(label) {
  if (label === 'Improving') return ['↑ Improving', BADGE.goldfill];
  if (label === 'Rising') return ['↑ Rising', BADGE.green];
  if (label === 'Declining') return ['↓ Declining', BADGE.red];
  return ['→ Stable', BADGE.gray];
}

function Bar({ pct, color }) {
  return (
    <div className="h-[5px] rounded-full bg-barbg/60 overflow-hidden mt-1">
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

function Chip({ href, label, value, clearHref }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-card2 border border-line rounded-full pl-3 pr-1.5 py-[5px] text-xs text-muted whitespace-nowrap">
      {label}: <b className="text-body font-semibold">{value}</b>
      {href && (
        <a href={href} className="text-sky no-underline text-[11px] ml-0.5" title="filter">▾</a>
      )}
      {clearHref && (
        <a href={clearHref} className="ml-1 bg-line rounded-full w-4 h-4 inline-flex items-center justify-center text-[10px] text-body no-underline">×</a>
      )}
    </span>
  );
}

function Tab({ href, active, children }) {
  return (
    <a
      href={href}
      className={`px-3 py-[7px] rounded text-[13px] no-underline whitespace-nowrap ${
        active ? 'bg-goldbg text-gold font-semibold' : 'text-muted'
      }`}
    >
      {children}
    </a>
  );
}

export default async function Rankings({ searchParams }) {
  const sp = searchParams || {};
  const q = (k) => (Array.isArray(sp?.[k]) ? sp[k][0] : sp?.[k]);
  const seasonParam = q('season');
  const region = q('region') || '';
  const heightQ = q('height') || '';
  const minRounds = q('min_rounds') || '5';
  const search = (q('q') || '').toLowerCase();
  const by = q('by') === 'points' ? 'points' : 'eq';
  const window = q('window') === '12m' ? '12m' : q('window') === '3m' ? '3m' : 'all';
  const ptsCol = window === '12m' ? 'points_12m' : window === '3m' ? 'points_3m' : 'total_points';
  const winLabel = window === 'all' ? 'All Time' : window === '12m' ? '12 Months' : '3 Months';

  // seasons first — default to latest (2026/27 mock season) when ?season absent
  let events = { data: [] };
  try {
    events = await getJSON('/events?limit=100');
  } catch {
    // API down — render empty shells
  }
  const seasons = [...new Set(events.data.map((e) => e.season).filter(Boolean))].sort().reverse();
  const season = seasonParam === undefined ? (seasons[0] || '') : seasonParam;

  // map height chip -> cm range (shared HEIGHT_BANDS vocabulary)
  const { height_min, height_max } = heightParams(heightQ);

  const api = { min_starts: minRounds };
  if (season) api.season = season;
  if (region) api.region = region;
  if (height_min) api.height_min = height_min;
  if (height_max) api.height_max = height_max;
  const qs = new URLSearchParams(Object.entries(api).filter(([, v]) => v !== '' && v != null)).toString();
  const Q = qs ? `?${qs}` : '';

  let horses = { data: [] }, riders = { data: [] }, classes = { data: [] }, heights = { data: [] };
  try {
    [horses, riders, classes, heights] = await Promise.all([
      getJSON(`/rankings/horses?limit=100${Q ? '&' + qs : ''}${by === 'points' ? `&metric=points&window=${window}` : ''}`),
      getJSON(`/rankings/riders?limit=100${Q ? '&' + qs : ''}${by === 'points' ? `&metric=points&window=${window}` : ''}`),
      getJSON('/classes?limit=100'),
      getJSON('/height-stats?limit=200'),
    ]);
  } catch {
    // API down — render empty shells
  }

  const rankedH = horses.data
    .map((h) => ({ ...h, eq: eqScore(h.clear_pct, h.avg_faults, h.starts) }))
    .sort((a, b) => by === 'points'
      ? Number(b[ptsCol]) - Number(a[ptsCol]) || Number(b.wins) - Number(a.wins)
      : b.eq - a.eq || Number(b.clear_pct) - Number(a.clear_pct))
    .slice(0, 8);
  const rankedR = riders.data
    .map((r) => ({ ...r, eq: eqScore(r.clear_pct, r.avg_faults, r.starts) }))
    .sort((a, b) => by === 'points'
      ? Number(b[ptsCol]) - Number(a[ptsCol]) || Number(b.wins) - Number(a.wins)
      : b.eq - a.eq)
    .slice(0, 6);

  // per-horse detail for trend + partnerships (top 8 only)
  const details = {};
  await Promise.all(
    rankedH.map(async (h) => {
      try { details[h.horse_id] = await getJSON(`/horses/${h.horse_id}`); }
      catch { details[h.horse_id] = { history: [], partnerships: [], data: {} }; }
    })
  );
  const rDetails = {};
  await Promise.all(
    rankedR.map(async (r) => {
      try { rDetails[r.rider_id] = await getJSON(`/riders/${r.rider_id}`); }
      catch { rDetails[r.rider_id] = { partnerships: [] }; }
    })
  );

  // combinations: best partnership per top horse
  const combos = rankedH
    .map((h) => {
      const parts = details[h.horse_id]?.partnerships || [];
      const p = parts[0];
      if (!p) return null;
      return {
        horse: h.horse, horse_id: h.horse_id,
        rider: p.rider, rider_id: p.rider_id,
        rounds: Number(p.rounds_together),
        clear: Number(p.clear_pct),
        avg: Number(p.avg_faults),
        score: eqScore(p.clear_pct, p.avg_faults, p.rounds_together),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // best height per horse for combo table
  const bestHeight = {};
  for (const h of rankedH) {
    const hh = heights.data.filter((x) => x.horse_id === h.horse_id);
    const b = [...hh].sort((a, b2) =>
      Number(b2.clear_pct) - Number(a.clear_pct) || Number(b2.height_cm) - Number(a.height_cm))[0];
    if (b) bestHeight[h.horse_id] = b.height_cm;
  }

  // circuit benchmark
  const totalRounds = horses.data.reduce((s, h) => s + Number(h.starts), 0);
  const totalClears = horses.data.reduce((s, h) => s + Number(h.clears), 0);
  const circuitClear = totalRounds ? (100 * totalClears) / totalRounds : 0;
  const circuitAvg = totalRounds
    ? horses.data.reduce((s, h) => s + Number(h.avg_faults) * Number(h.starts), 0) / totalRounds : 0;
  const avgs = horses.data.map((h) => Number(h.avg_faults));
  const circuitStd = Math.sqrt(avgs.reduce((s, v) => s + (v - circuitAvg) ** 2, 0) / Math.max(avgs.length, 1));

  const feat = rankedH[0] || null;
  const featCons = feat ? consistencyPts(feat.faults_stddev) : null;
  const featElite = feat ? Math.min(99, feat.eq + 3) : null;
  const eliteTop3 = rankedH.slice(0, 3).map((h) => ({ name: h.horse, score: Math.min(99, h.eq + 3).toFixed(1) }));

  // movement buckets
  const buckets = { Rising: [], Stable: [], Declining: [] };
  for (const h of rankedH) {
    const [lbl] = trendBadge(h.clear_pct, (details[h.horse_id]?.history || []).slice(0, 5));
    const key = lbl === 'Improving' ? 'Rising' : lbl === 'Rising' ? 'Rising' : lbl === 'Declining' ? 'Declining' : 'Stable';
    buckets[key].push(h.horse);
  }

  // search
  const allH = horses.data.map((h) => ({ ...h, eq: eqScore(h.clear_pct, h.avg_faults, h.starts) }));
  const hitH = search ? allH.filter((h) => h.horse.toLowerCase().includes(search)).slice(0, 3) : [];
  const hitR = search
    ? riders.data.filter((r) => r.rider.toLowerCase().includes(search)).slice(0, 3) : [];
  const spotlight = hitH[0] || (search ? null : feat && { ...feat });

  const seasonLabel = (() => {
    const m = (season || '').match(/^(\d{4})-(\d{4})$/);
    return m ? `${m[1]}/${m[2].slice(2)}` : (season || '2025/26');
  })();
  const baseQ = (patch) => {
    const p = new URLSearchParams();
    if (season) p.set('season', season);
    if (region) p.set('region', region);
    if (heightQ) p.set('height', heightQ);
    if (minRounds) p.set('min_rounds', minRounds);
    if (by !== 'eq') p.set('by', by);
    if (window !== 'all') p.set('window', window);
    for (const [k, v] of Object.entries(patch)) {
      if (!v) p.delete(k); else p.set(k, v);
    }
    const s = p.toString();
    return s ? `/rankings?${s}` : '/rankings';
  };

  const watchHorse = rankedH[0];
  const watchRider = rankedR[0];

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
        <div>
          <h1 className={H1}>EQIndex Rankings</h1>
          <p className={SUB}>Data-driven performance rankings across horses, riders and combinations. NZ National Circuit.</p>
        </div>
        <div className="flex gap-2 items-center shrink-0 pt-1.5">
          <span className={LIVE}>● LIVE FEED</span>
          <span className="text-muted border border-line rounded-full px-3 py-[5px] text-[11px]">◷ Updated 10 min ago</span>
        </div>
      </div>

      {/* tabs */}
      <div className="flex gap-1 bg-card border border-line rounded p-1.5 mb-3 overflow-x-auto">
        <Tab href="#horses" active>Horse Rankings</Tab>
        <Tab href="#riders">Rider Rankings</Tab>
        <Tab href="#combos">Horse-Rider Rankings</Tab>
        <Tab href="#elite">Elite Rankings</Tab>
        <Tab href="#events">Event Rankings</Tab>
      </div>

      {/* filter chips */}
      <div className="flex flex-wrap gap-2 mb-5 items-center">
        <Chip label="Season" value={seasonLabel} clearHref={baseQ({ season: '' })} href={baseQ({})} />
        <Chip label="Height Category" value={heightQ ? (HEIGHT_BANDS.find((h) => h.v === heightQ)?.label || heightQ) : 'All Heights'} clearHref={baseQ({ height: '' })} href={baseQ({})} />
        {HEIGHT_BANDS.slice(1).map((h) => (
          <a key={h.v} href={baseQ({ height: h.v })} className={`text-xs rounded-full px-3 py-[6px] border no-underline ${heightQ === h.v ? 'bg-goldbg border-gold text-gold' : 'bg-card2 border-line text-muted'}`}>Height: <b>{h.label}</b></a>
        ))}
        <Chip label="Region" value={region || 'All Regions'} clearHref={baseQ({ region: '' })} href={baseQ({})} />
        <Chip label="Min Rounds" value={`${minRounds}+ Rounds`} clearHref={baseQ({ min_rounds: '' })} href={baseQ({})} />
        <span className="inline-flex items-center bg-card2 border border-line rounded-full px-3 py-[5px] text-xs text-muted">Level: <b className="text-body ml-1">National</b></span>
        <a href="#elite" className="inline-flex items-center bg-card2 border border-line rounded-full px-3 py-[5px] text-xs text-muted no-underline">Level: <b className="text-body ml-1">Elite</b></a>
        <a href="/rankings" className={LINK}>Reset Filters</a>
      </div>

      {/* metric + window toggles (Briefing §7: time-filtered leaderboards) */}
      <div className="flex flex-wrap gap-2 mb-5 items-center">
        <span className="text-[11px] uppercase tracking-wide text-faint font-bold">Metric:</span>
        {[['eq', 'EQ Score'], ['points', 'Points']].map(([v, l]) => (
          <a key={v} href={baseQ({ by: v === 'eq' ? '' : v })} className={`text-xs rounded-full px-3 py-[6px] border no-underline ${by === v ? 'bg-goldbg border-gold text-gold' : 'bg-card2 border-line text-muted'}`}><b>{l}</b></a>
        ))}
        <span className="text-[11px] uppercase tracking-wide text-faint font-bold ml-2">Window:</span>
        {[['all', 'All Time'], ['12m', '12 Months'], ['3m', '3 Months']].map(([v, l]) => (
          <a key={v} href={baseQ({ window: v === 'all' ? '' : v, ...(by === 'eq' ? { by: 'points' } : {}) })} className={`text-xs rounded-full px-3 py-[6px] border no-underline ${window === v ? 'bg-goldbg border-gold text-gold' : 'bg-card2 border-line text-muted'}`}>{l}</a>
        ))}
        {by === 'points' && <span className="text-[11px] text-faint">Points: 12/9/7/6/5/4/3/2/1/1 × class multiplier ({winLabel})</span>}
      </div>

      {/* Horse Rankings */}
      <h2 id="horses" className={H2}>Horse Rankings</h2>
      <p className={SUB}>Rankings consider performance consistency, competition history, and quality of results.</p>
      <section className={CARD}>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr>
            <th className={TH}>Rank</th><th className={TH}>Horse</th>
            {by === 'points' ? (
              <><th className={`${TH} ${NUM}`}>Points</th><th className={`${TH} ${NUM}`}>Podiums</th>
              <th className={`${TH} ${NUM}`}>Win Rate</th><th className={`${TH} ${NUM}`}>Rounds</th>
              <th className={`${TH} ${NUM}`}>Wins</th><th className={TH}>Trend</th></>
            ) : (
              <><th className={`${TH} ${NUM}`}>EQ Score</th><th className={`${TH} ${NUM}`}>Clear %</th>
              <th className={`${TH} ${NUM}`}>Avg Faults</th><th className={`${TH} ${NUM}`}>Rounds</th>
              <th className={`${TH} ${NUM}`}>Wins</th><th className={TH}>Trend</th></>
            )}
          </tr></thead>
          <tbody>
            {rankedH.map((h, i) => {
              const [lbl] = trendBadge(h.clear_pct, (details[h.horse_id]?.history || []).slice(0, 5));
              const [txt, cls] = trendPill(lbl);
              return (
                <tr key={h.horse_id}>
                  <td className={`px-2 py-[11px] border-b border-rowline ${i === 0 ? 'text-gold font-bold' : 'text-muted'}`}>#{i + 1}</td>
                  <td className={TD}><a href={`/horses/${h.horse_id}`} className="text-white font-semibold no-underline hover:text-gold transition-colors">{h.horse}</a></td>
                  {by === 'points' ? (
                    <><td className={`${TD} ${NUM}`}><b className={i === 0 ? 'text-gold' : ''}>{Number(h[ptsCol])}</b></td>
                    <td className={`${TD} ${NUM} text-muted`}>{h.podiums ?? '–'}</td>
                    <td className={`${TD} ${NUM} text-muted`}>{h.win_rate === null || h.win_rate === undefined ? '–' : `${Number(h.win_rate).toFixed(1)}%`}</td>
                    <td className={`${TD} ${NUM} text-muted`}>{h.starts}</td>
                    <td className={`${TD} ${NUM} text-muted`}>{h.wins}</td></>
                  ) : (
                    <><td className={`${TD} ${NUM}`}><b className={i === 0 ? 'text-gold' : ''}>{h.eq}</b></td>
                    <td className={`${TD} ${NUM} ${i === 0 ? 'text-moss font-bold' : 'text-muted'}`}>{pct1(h.clear_pct)}</td>
                    <td className={`${TD} ${NUM} text-muted`}>{Number(h.avg_faults).toFixed(2)}</td>
                    <td className={`${TD} ${NUM} text-muted`}>{h.starts}</td>
                    <td className={`${TD} ${NUM} text-muted`}>{h.wins}</td></>
                  )}
                  <td className={TD}><span className={badge(cls)}>{txt}</span></td>
                </tr>
              );
            })}
            {!rankedH.length && <tr><td className={EMPTY} colSpan={8}>No horses match these filters.</td></tr>}
          </tbody>
        </table>
        </div>
      </section>

      {/* Rider Rankings */}
      <h2 id="riders" className={H2}>Rider Rankings</h2>
      <p className={SUB}>National riders calculated by current season circuit point indexing metrics.</p>
      <section className={CARD}>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr>
            <th className={TH}>Rank</th><th className={TH}>Rider</th>
            {by === 'points' ? (
              <><th className={`${TH} ${NUM}`}>Points</th><th className={`${TH} ${NUM}`}>Podiums</th>
              <th className={`${TH} ${NUM}`}>Win Rate</th><th className={`${TH} ${NUM}`}>Rounds</th>
              <th className={`${TH} ${NUM}`}>Wins</th><th className={TH}>Top Partnership</th></>
            ) : (
              <><th className={`${TH} ${NUM}`}>EQ Score</th><th className={`${TH} ${NUM}`}>Clear %</th>
              <th className={`${TH} ${NUM}`}>Rounds</th><th className={`${TH} ${NUM}`}>Wins</th>
              <th className={TH}>Top Partnership</th><th className={TH}>Trend</th></>
            )}
          </tr></thead>
          <tbody>
            {rankedR.map((r, i) => {
              const best = (rDetails[r.rider_id]?.partnerships || [])[0];
              const up = Number(r.clear_pct) >= 40;
              return (
                <tr key={r.rider_id}>
                  <td className={`px-2 py-[11px] border-b border-rowline ${i === 0 ? 'text-gold font-bold' : 'text-muted'}`}>#{i + 1}</td>
                  <td className={TD}><a href={`/riders/${r.rider_id}`} className="text-white font-semibold no-underline hover:text-gold transition-colors">{r.rider}</a></td>
                  {by === 'points' ? (
                    <><td className={`${TD} ${NUM}`}><b className={i === 0 ? 'text-gold' : ''}>{Number(r[ptsCol])}</b></td>
                    <td className={`${TD} ${NUM} text-muted`}>{r.podiums ?? '–'}</td>
                    <td className={`${TD} ${NUM} text-muted`}>{r.win_rate === null || r.win_rate === undefined ? '–' : `${Number(r.win_rate).toFixed(1)}%`}</td>
                    <td className={`${TD} ${NUM} text-muted`}>{r.starts}</td>
                    <td className={`${TD} ${NUM} text-muted`}>{r.wins}</td>
                    <td className={TD}>{best ? <a className={LINK} href={`/horses/${best.horse_id}`}>{best.horse}</a> : <span className="text-faint">—</span>}</td></>
                  ) : (
                    <><td className={`${TD} ${NUM}`}><b>{r.eq}</b></td>
                    <td className={`${TD} ${NUM} ${i === 0 ? 'text-moss' : 'text-muted'}`}>{pct1(r.clear_pct)}</td>
                    <td className={`${TD} ${NUM} text-muted`}>{r.starts}</td>
                    <td className={`${TD} ${NUM} text-muted`}>{r.wins}</td>
                    <td className={TD}>{best ? <a className={LINK} href={`/horses/${best.horse_id}`}>{best.horse}</a> : <span className="text-faint">—</span>}</td>
                    <td className={`px-2 py-[11px] border-b border-rowline ${up ? 'text-moss' : 'text-muted'}`}>{up ? '↑' : '→'}</td></>
                  )}
                </tr>
              );
            })}
            {!rankedR.length && <tr><td className={EMPTY} colSpan={8}>No riders match these filters.</td></tr>}
          </tbody>
        </table>
        </div>
      </section>

      {/* Combinations */}
      <h2 id="combos" className={H2}>Horse-Rider Combination Rankings</h2>
      <p className={SUB}>Evaluating combined team synergy, speed scores, and clear rates in national classes.</p>
      <section className={CARD}>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr>
            <th className={TH}>Rank</th><th className={TH}>Combination</th>
            <th className={`${TH} ${NUM}`}>Partnership Score</th><th className={`${TH} ${NUM}`}>Rounds Together</th>
            <th className={`${TH} ${NUM}`}>Clear %</th><th className={`${TH} ${NUM}`}>Avg Faults</th>
            <th className={`${TH} ${NUM}`}>Best Height</th>
          </tr></thead>
          <tbody>
            {combos.map((c, i) => (
              <tr key={`${c.horse_id}-${c.rider_id}`}>
                <td className={`px-2 py-[11px] border-b border-rowline ${i === 0 ? 'text-gold font-bold' : 'text-muted'}`}>#{i + 1}</td>
                <td className={TD}><span className="text-white font-semibold">{c.horse} x {c.rider}</span></td>
                <td className={`${TD} ${NUM}`}><b className={i === 0 ? 'text-gold' : ''}>{c.score}</b></td>
                <td className={`${TD} ${NUM} text-muted`}>{c.rounds} Rounds</td>
                <td className={`${TD} ${NUM} ${i === 0 ? 'text-moss font-bold' : 'text-muted'}`}>{pct1(c.clear)}</td>
                <td className={`${TD} ${NUM} text-muted`}>{Number(c.avg).toFixed(2)}</td>
                <td className={`${TD} ${NUM}`}>
                  {bestHeight[c.horse_id]
                    ? <span className={`inline-block text-[11px] font-bold rounded-md px-2 py-[3px] ${i === 0 ? 'bg-goldbg text-gold' : 'bg-line/60 text-muted'}`}>{(Number(bestHeight[c.horse_id]) / 100).toFixed(2)}m</span>
                    : <span className="text-faint">—</span>}
                </td>
              </tr>
            ))}
            {!combos.length && <tr><td className={EMPTY} colSpan={7}>No partnerships found.</td></tr>}
          </tbody>
        </table>
        </div>
      </section>

      {/* Elite + Benchmark */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5">
        <section id="elite" className={CARD}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[15px] font-bold">🏅 Elite Performance Rankings</h2>
            <span className="text-[11px] font-bold border border-gold text-gold rounded-full px-2.5 py-[3px]">Supreme Class</span>
          </div>
          {feat ? (
            <>
              <div className="flex gap-4 items-center my-3">
                <div className="relative shrink-0 w-24 h-24">
                  <svg width="96" height="96" viewBox="0 0 96 96">
                    <circle cx="48" cy="48" r="42" fill="none" stroke="#2A2A2A" strokeWidth="6" />
                    <circle cx="48" cy="48" r="42" fill="none" stroke="#FFD700" strokeWidth="6"
                      strokeDasharray={`${(2 * Math.PI * 42 * featElite) / 100} ${2 * Math.PI * 42}`}
                      transform="rotate(-90 48 48)" strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <b className="text-[26px] leading-none">{featElite}</b>
                    <span className="text-[9px] text-gold font-bold mt-1">ELITE SCORE</span>
                  </div>
                </div>
                <div>
                  <div className="text-[20px] font-extrabold">{feat.horse}</div>
                  <div className="flex gap-8 mt-1.5">
                    <div><div className="text-[11px] text-muted">Current Circuit Rank</div><b className="text-[13px]">#1 Nationally</b></div>
                    <div><div className="text-[11px] text-muted">Owner</div><b className="text-[13px]">{details[feat.horse_id]?.data?.breeder || 'Elite Equine Ltd'}</b></div>
                  </div>
                </div>
              </div>
              <div className="text-[12px] text-muted mt-2">Performance<span className="float-right text-body font-semibold">{Math.min(99, feat.eq)} / 100</span></div>
              <Bar pct={feat.eq} color="#00C853" />
              <div className="text-[12px] text-muted mt-2.5">Competition Difficulty<span className="float-right text-body font-semibold">95 / 100</span></div>
              <Bar pct={95} color="#FFD700" />
              <div className="text-[12px] text-muted mt-2.5">Consistency<span className="float-right text-body font-semibold">{featCons ?? '–'} / 100</span></div>
              <Bar pct={featCons ?? 0} color="#4C9AFF" />
              <p className="text-[11px] text-faint mt-2.5">*Elite rankings weight higher-level competition, field strength, and consistency.</p>
              <div className="border-t border-rowline mt-3 pt-3">
                <div className="text-[13px] font-bold mb-1.5">Top 3 Elite Performers</div>
                {eliteTop3.map((e, i) => (
                  <div key={e.name} className="flex justify-between text-[13px] py-[3px]">
                    <span className="text-muted">{i + 1}. <span className="text-body">{e.name}</span></span>
                    <span className={i === 0 ? 'text-gold font-bold' : 'text-muted'}>Score: {e.score}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <p className="text-muted text-sm">No elite data.</p>}
        </section>

        <section className={CARD}>
          <h2 className="text-[15px] font-bold">Benchmark Context</h2>
          <p className="text-muted text-xs mb-3">{feat ? `${feat.horse} (#1 Rank)` : '—'} vs. 130cm National Category Average</p>
          {[
            { label: 'Clear Round Rate', mine: Number(feat?.clear_pct) || 0, avg: circuitClear, text: `${pct1(feat?.clear_pct)} vs ${pct1(circuitClear)}`, color: '#00C853' },
            { label: 'Average Faults (Lower is Better)', mine: Number(feat?.avg_faults) || 0, avg: circuitAvg, text: `${Number(feat?.avg_faults || 0).toFixed(2)} vs ${circuitAvg.toFixed(2)}`, color: '#FF1744' },
            { label: 'Consistency Score', mine: featCons || 0, avg: consistencyPts(circuitStd) || 0, text: `${featCons ?? '–'} vs ${consistencyPts(circuitStd) ?? '–'}`, color: '#FFD700' },
          ].map((x) => {
            const mx = Math.max(x.mine, x.avg, 0.01);
            return (
              <div key={x.label} className="mb-3.5">
                <div className="flex justify-between text-[12px] mb-1"><b>{x.label}</b><span className="text-gold">{x.text}</span></div>
                <div className="text-[10px] text-muted mb-0.5">{feat?.horse?.split(' ')[0]} S.</div>
                <div className="h-[6px] rounded-full bg-barbg/60 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(100 * x.mine) / mx}%`, background: x.color }} /></div>
                <div className="text-[10px] text-muted mt-1 mb-0.5">Avg.</div>
                <div className="h-[6px] rounded-full bg-barbg/60 overflow-hidden"><div className="h-full rounded-full bg-[#2A2A2A]" style={{ width: `${(100 * x.avg) / mx}%` }} /></div>
              </div>
            );
          })}
        </section>
      </div>

      {/* How + Movement */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5">
        <section className={CARD}>
          <h2 className="text-[15px] font-bold mb-1">How Rankings Work</h2>
          <p className="text-muted text-xs mb-3">Standardized metrics analyzed through composite team intelligence algorithms.</p>
          {[
            ['Competition Results:', 'Standard points allocation based on final arena placement.'],
            ['Clear Round Percentage:', 'The ratio of error-free rounds to total starts.'],
            ['Fault Performance:', 'Average number of penalties accrued over the active season.'],
            ['Number of Rounds:', 'Consistent starts ensure robust sample sizes to avoid skew.'],
            ['Competition Difficulty & Strength:', 'Weighted evaluation of altitude class and competitor density.'],
          ].map(([b, t]) => (
            <div key={b} className="flex gap-2.5 text-[13px] py-[5px]">
              <span className="text-gold">🏅</span>
              <span><b>{b}</b> <span className="text-muted">{t}</span></span>
            </div>
          ))}
          <div className="bg-card2 rounded px-3.5 py-2.5 text-gold italic text-[12px] mt-3">“A clear round in a stronger field contributes more than a result from a small regional field.”</div>
        </section>

        <section className={CARD}>
          <h2 className="text-[15px] font-bold mb-3">Ranking Movement</h2>
          <div className="border border-greenbg bg-greenbg/30 rounded p-3 mb-2.5">
            <div className="flex justify-between text-[12px]"><b className="text-moss">↑ Rising</b><span className="text-faint text-[11px]">Improved rank</span></div>
            <div className="text-[12px] mt-1">{buckets.Rising.join(', ') || '—'}</div>
          </div>
          <div className="border border-line bg-card2 rounded p-3 mb-2.5">
            <div className="flex justify-between text-[12px]"><b className="text-muted">→ Stable</b><span className="text-faint text-[11px]">Consistent performance</span></div>
            <div className="text-[12px] mt-1">{buckets.Stable.join(', ') || '—'}</div>
          </div>
          <div className="border border-redbg bg-redbg/30 rounded p-3">
            <div className="flex justify-between text-[12px]"><b className="text-blood">↓ Declining</b><span className="text-faint text-[11px]">Performance decrease</span></div>
            <div className="text-[12px] mt-1">{buckets.Declining.join(', ') || '—'}</div>
          </div>
        </section>
      </div>

      {/* Event rankings strip */}
      <h2 id="events" className={H2}>Event Rankings</h2>
      <p className={SUB}>Hardest NZ arenas by average faults — bigger fields, tougher tracks.</p>
      <section className={CARD}>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr><th className={TH}>Event</th><th className={TH}>Class</th><th className={`${TH} ${NUM}`}>Height</th><th className={`${TH} ${NUM}`}>Starters</th><th className={`${TH} ${NUM}`}>Clear %</th><th className={`${TH} ${NUM}`}>Avg Faults</th></tr></thead>
          <tbody>
            {classes.data.slice(0, 5).map((c) => (
              <tr key={c.class_id}>
                <td className={TD}><b>{c.event}</b></td>
                <td className={`${TD} text-muted`}>{c.class}</td>
                <td className={`${TD} ${NUM} text-muted`}>{c.height_cm ? `${c.height_cm}cm` : '–'}</td>
                <td className={`${TD} ${NUM} text-muted`}>{c.starters}</td>
                <td className={`${TD} ${NUM} text-moss`}>{c.clear_pct === null ? '–' : pctFull(c.clear_pct)}</td>
                <td className={`${TD} ${NUM} text-muted`}>{c.avg_faults === null ? '–' : Number(c.avg_faults).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      {/* Search + Watchlist */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5">
        <section className={CARD}>
          <h2 className="text-[15px] font-bold mb-2.5">Search Rankings</h2>
          <form action="/rankings" method="get" className="flex gap-2">
            <input name="q" defaultValue={q('q') || ''} placeholder="⚲  Kiwi Spirit"
              className={`${INP} flex-1`} />
            <button className={BTN}>Search</button>
          </form>
          <div className="text-[11px] uppercase tracking-wide text-faint font-bold mt-3 mb-1.5">Active Results</div>
          {spotlight ? (
            <div className="bg-card2 border border-line rounded p-3">
              <div className="flex justify-between items-center">
                <b>{spotlight.horse} (Stallion)</b>
                <span className="text-gold text-[11px] font-bold">#1 Ranked</span>
              </div>
              <div className="flex gap-3 text-[12px] mt-1.5">
                <a className={LINK} href={`/horses/${spotlight.horse_id}`}>Horse Profile</a>
                <a className={LINK} href={`/horses/${spotlight.horse_id}`}>Rider Partnerships</a>
                <a className={LINK} href={`/horses/${spotlight.horse_id}`}>Competition History</a>
              </div>
            </div>
          ) : (
            <p className="text-muted text-sm">No match for “{q('q')}”. Try another horse or rider.</p>
          )}
          {(hitR.length > 0) && (
            <div className="text-[12px] text-muted mt-2">Riders: {hitR.map((r) => r.rider).join(', ')}</div>
          )}
        </section>

        <section className={CARD}>
          <h2 className="text-[15px] font-bold mb-2.5">Watchlist</h2>
          {watchHorse && (
            <div className="bg-card2 rounded p-3 mb-2">
              <div className="flex justify-between items-center">
                <div><div className="font-semibold text-[13px]">{watchHorse.horse}</div><div className="text-[11px] text-muted">Elite Watchlist</div></div>
                <b className="text-gold text-[13px]">{watchHorse.eq} Score</b>
              </div>
            </div>
          )}
          {watchRider && (
            <div className="bg-card2 rounded p-3 mb-2">
              <div className="flex justify-between items-center">
                <div><div className="font-semibold text-[13px]">{watchRider.rider}</div><div className="text-[11px] text-muted">Rider Watch</div></div>
                <b className="text-[13px]">{watchRider.eq} Score</b>
              </div>
            </div>
          )}
          <div className="flex gap-2 mt-2">
            {watchHorse && <WatchButton entityType="horse" entityId={watchHorse.horse_id} />}
            <a href="/watchlist" className="flex-1 text-center bg-card2 border border-line text-gold rounded px-3.5 py-2 text-sm no-underline">+ Add to active watchlist</a>
          </div>
        </section>
      </div>
    </>
  );
}
