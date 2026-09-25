import { getJSON } from '../../../lib/api';
import { eqScore, fieldScore, strengthLabel, ordinal } from '../../../lib/eq';
import { BADGE, CARD, H1, H2, LINK, LIVE, MUT, NUM, SUB, TABLE, TABLEWRAP, TD, TH, badge } from '../../../lib/tokens';
import { ScoreRing } from '../../../components/charts';
import MiniTrend from '../../../components/MiniTrend';
import ClassResults from '../../../components/ClassResults';

export const dynamic = 'force-dynamic';

const pct1 = (v) => `${Number(v).toFixed(1)}%`;
const d = (o) => new Date(o).toLocaleDateString('en-NZ', { month: 'short', year: '2-digit' });

export default async function EventDetail({ params }) {
  const [a, arenas, rankAll, allClasses, trends] = await Promise.all([
    getJSON(`/events/${params.id}/analytics`),
    getJSON('/arenas'),
    getJSON('/rankings/horses?limit=1000'),
    getJSON('/classes?limit=500'),
    getJSON('/trends/circuit'),
  ]);
  const e = a.event;
  const rounds = a.rounds;
  const n = rounds.length;
  const clears = rounds.filter((r) => r.clear_round).length;
  const clearPct = n ? 100 * clears / n : 0;
  const avgF = n ? rounds.reduce((s, r) => s + Number(r.total_faults), 0) / n : 0;
  const score = fieldScore(clearPct, avgF);
  const strength = strengthLabel(score);
  const maxH = Math.max(0, ...rounds.map((r) => Number(r.height_cm) || 0));
  const grade = maxH >= 140 ? 'A-Grade Event' : maxH >= 130 ? 'B-Grade Event' : 'Club Event';
  const horsesN = new Set(rounds.map((r) => r.horse)).size;
  const ridersN = new Set(rounds.map((r) => r.rider)).size;

  // circuit benchmark from career rankings
  const totS = rankAll.data.reduce((s, h) => s + Number(h.starts), 0);
  const totC = rankAll.data.reduce((s, h) => s + Number(h.clears), 0);
  const circClear = totS ? 100 * totC / totS : 0;
  const circAvg = totS ? rankAll.data.reduce((s, h) => s + Number(h.avg_faults) * Number(h.starts), 0) / totS : 0;
  const circScore = fieldScore(circClear, circAvg);
  const avgPerEvent = 8; // demo circuit scale reference
  const fmtDate = `${d(e.date_start)}–${d(e.date_end)}`;

  // height + fault distributions
  const buckets = [[100, 110], [110, 120], [120, 130], [130, 140], [140, 999]];
  const hb = buckets.map(([lo, hi]) => {
    const rs = rounds.filter((r) => Number(r.height_cm) >= lo && Number(r.height_cm) < hi);
    return { label: hi >= 999 ? '1.40m - 1.50m+' : `1.${String(lo).slice(1)}0m - 1.${String(hi).slice(1)}0m`, n: rs.length, p: rs.length ? 100 * rs.filter((r) => r.clear_round).length / rs.length : 0 };
  }).filter((b) => b.n > 0);
  const fb = [
    ['Clear (0 Faults)', rounds.filter((r) => Number(r.total_faults) === 0).length, '#00C853'],
    ['1 - 4 Faults', rounds.filter((r) => Number(r.total_faults) >= 1 && Number(r.total_faults) <= 4).length, '#4C9AFF'],
    ['5 - 8 Faults', rounds.filter((r) => Number(r.total_faults) >= 5 && Number(r.total_faults) <= 8).length, '#FFD700'],
    ['9+ Faults', rounds.filter((r) => Number(r.total_faults) >= 9).length, '#FF1744'],
  ].map(([label, c, color]) => ({ label, p: n ? 100 * c / n : 0, color }));

  // arena section
  const arena = arenas.data.find((x) => x.arena === e.arena_type) || { clear_pct: clearPct, avg_faults: avgF, rounds: n };
  const bestArena = [...arenas.data].sort((x, y) => Number(y.clear_pct) - Number(x.clear_pct))[0];
  const arenaColors = {};
  [...arenas.data].sort((x, y) => Number(y.clear_pct) - Number(x.clear_pct))
    .forEach((x, i, arr) => { arenaColors[x.arena] = i === 0 ? '#00C853' : i === arr.length - 1 ? '#FF1744' : '#4C9AFF'; });

  // event micro-rankings from rounds
  const byHorse = {};
  for (const r of rounds) {
    (byHorse[r.horse] ||= { starts: 0, clears: 0, faults: 0 });
    byHorse[r.horse].starts++; byHorse[r.horse].faults += Number(r.total_faults);
    if (r.clear_round) byHorse[r.horse].clears++;
  }
  const evHorses = Object.entries(byHorse).map(([horse, v]) => ({
    horse, ...v, clear: 100 * v.clears / v.starts, avg: v.faults / v.starts,
    eq: eqScore(100 * v.clears / v.starts, v.faults / v.starts, v.starts),
  })).sort((x, y) => y.eq - x.eq).slice(0, 5);
  const byRider = {};
  for (const r of rounds) {
    (byRider[r.rider] ||= { starts: 0, clears: 0, faults: 0 });
    byRider[r.rider].starts++; byRider[r.rider].faults += Number(r.total_faults);
    if (r.clear_round) byRider[r.rider].clears++;
  }
  const evRiders = Object.entries(byRider).map(([rider, v]) => ({
    rider, ...v, eq: eqScore(100 * v.clears / v.starts, v.faults / v.starts, v.starts),
  })).sort((x, y) => y.eq - x.eq).slice(0, 5);
  const evParts = [...a.partnerships].sort((x, y) => Number(y.clear_pct) - Number(x.clear_pct)).slice(0, 3)
    .map((p) => ({ ...p, match: eqScore(p.clear_pct, p.avg_faults, p.rounds) }));

  // per-class result groups (accordion), sorted by placing, nulls last
  const byClass = {};
  for (const r of rounds) {
    const k = r.class_id || r.class_name;
    (byClass[k] ||= { class_id: r.class_id, name: r.class_name || 'Unnamed class', height_cm: r.height_cm, class_type: null, rounds: [] });
    byClass[k].rounds.push(r);
  }
  const classMeta = Object.fromEntries((a.classes || []).map((c) => [c.class_id, c]));
  const classOrder = Object.fromEntries((a.classes || []).map((c, i) => [c.class_id, i]));
  const groups = Object.values(byClass).map((g) => {
    const meta = (g.class_id && classMeta[g.class_id]) || {};
    for (const k of ['class_type', 'class_number', 'format', 'sponsor', 'series_key', 'result_status', 'height_cm']) {
      if (g[k] === null || g[k] === undefined) g[k] = meta[k] ?? g[k];
    }
    if (!g.height_cm && meta.height_cm) g.height_cm = meta.height_cm;
    const rs = [...g.rounds].sort((x, y) => (x.finish_place ?? 9999) - (y.finish_place ?? 9999));
    return { ...g, rounds: rs, clears: rs.filter((r) => r.clear_round).length };
  }).sort((x, y) => (classOrder[x.class_id] ?? 999) - (classOrder[y.class_id] ?? 999));

  // insights
  const sim = allClasses.data.filter((c) => c.event !== e.name && c.avg_faults !== null
    && Math.abs(Number(c.height_cm) - (maxH || 130)) <= 5);
  const simClear = sim.length ? sim.reduce((s, c) => s + Number(c.clear_pct), 0) / sim.length : circClear;
  const career = Object.fromEntries(rankAll.data.map((h) => [h.horse, Number(h.starts)]));
  const exp = rounds.filter((r) => (career[r.horse] || 0) >= 10);
  const nov = rounds.filter((r) => (career[r.horse] || 0) < 10);
  const expAvg = exp.length ? exp.reduce((s, r) => s + Number(r.total_faults), 0) / exp.length : 0;
  const novAvg = nov.length ? nov.reduce((s, r) => s + Number(r.total_faults), 0) / nov.length : 0;
  const insights = [
    `This event had ${clearPct < simClear ? 'higher' : 'lower'} difficulty than similar ${maxH}cm competitions — clear rate was ${Math.abs(clearPct - simClear).toFixed(1)}% ${clearPct < simClear ? 'below' : 'above'} regional average.`,
    `Clear rate sits ${Math.abs(clearPct - circClear).toFixed(1)}% ${clearPct < circClear ? 'below' : 'above'} the circuit average of ${circClear.toFixed(1)}%, suggesting course design was ${clearPct < circClear ? 'more technical' : 'more inviting'}.`,
    `Horses with 10+ career starts averaged ${expAvg.toFixed(1)} faults vs ${novAvg.toFixed(1)} for less experienced competitors.`,
  ];

  const months = trends.data.map((x) => ({ label: `${x.month} ${new Date(x.m).getFullYear().toString().slice(2)}`, v: x.starts }));
  const diffm = trends.data.map((x) => ({ label: `${x.month} ${new Date(x.m).getFullYear().toString().slice(2)}`, v: Number(x.avg_faults) }));

  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-3.5">
        <div>
          <h1 className={H1}>Event Intelligence Overview</h1>
          <p className={SUB}>Detailed physical arena, class, horse, and rider metadata from New Zealand&apos;s premier circuits.</p>
        </div>
        <div className="flex gap-2.5 items-center shrink-0 pt-1.5">
          <span className={LIVE}>● LIVE EVENT FEED</span>
          <span className="text-muted border border-line rounded-full px-3 py-[5px] text-xs">◷ Updated 10 min ago</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6 items-center">
        <span className="bg-card2 border border-line rounded pl-3 pr-1.5 py-[5px] text-xs text-muted">Event: <b className="text-body font-semibold">{e.name}</b></span>
        <span className="bg-card2 border border-line rounded pl-3 pr-1.5 py-[5px] text-xs text-muted">Height Category: <b className="text-body font-semibold">1.00m–1.50m+</b></span>
        <span className="bg-card2 border border-line rounded pl-3 pr-1.5 py-[5px] text-xs text-muted">Region: <b className="text-body font-semibold">{e.region || '—'}</b></span>
        <span className="bg-card2 border border-line rounded pl-3 pr-1.5 py-[5px] text-xs text-muted">Arena Type: <b className="text-body font-semibold">{e.arena_type || '—'}</b></span>
        <span className="bg-card2 border border-line rounded pl-3 pr-1.5 py-[5px] text-xs text-muted">Season: <b className="text-body font-semibold">{(e.season || '').replace('-', '–')}</b></span>
        <a className={LINK} href="/events">Reset Filters</a>
      </div>

      <section className={CARD}>
        <div className="flex items-center gap-2 mb-3">
          <h2 className={H2}>🎖 Active Competition Summary</h2>
          <div className="flex-1" />
          <span className={badge(BADGE.gold)}>{grade}</span>
        </div>
        <div className="flex gap-5 items-center">
          <ScoreRing score={score} />
          <div>
            <div className="text-[22px] font-extrabold">{e.name}</div>
            <div className="text-muted text-xs mt-1.5">
              Venue: <b className="text-body">{e.venue}</b>&nbsp;&nbsp;
              Region: <b className="text-body">{e.region}, NZ</b>&nbsp;&nbsp;
              Arena: <b className="text-body">{e.arena_type}</b>&nbsp;&nbsp;
              Date: <b className="text-body">{fmtDate}</b>
            </div>
          </div>
        </div>
      </section>

      <h2 className={H2}>Circuit Performance Overview</h2>
      <p className={SUB}>Consolidated statistics of {e.name} Event</p>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
        {[
          ['TOTAL CLASSES', `${a.classes.length} classes`, a.classes.length, false],
          ['TOTAL ROUNDS', `${n} rounds`, n, false],
          ['HORSES ENTERED', `${horsesN} entered`, horsesN, false],
          ['RIDERS ENTERED', `${ridersN} riders`, ridersN, false],
          ['CLEAR RATE', `${(clearPct - circClear) >= 0 ? '+' : ''}${(clearPct - circClear).toFixed(1)}% vs avg`, `${clearPct.toFixed(0)}%`, true],
          ['AVG FAULTS', `${(avgF - circAvg) >= 0 ? '+' : ''}${(avgF - circAvg).toFixed(1)} penalty`, avgF.toFixed(1), true],
          ['FIELD STRENGTH', `${strength} field`, score, false],
        ].map(([lbl, delta, big, _g]) => (
          <div className="bg-card border border-line rounded p-3.5 px-4" key={lbl}>
            <div className="text-[11px] text-muted tracking-[0.4px] uppercase">{lbl} <span className="text-gold font-bold">{delta}</span></div>
            <div className="text-[30px] font-extrabold mt-1.5">{big}</div>
          </div>
        ))}
      </div>

      <h2 className={H2}>Class Difficulty Analysis</h2>
      <p className={SUB}>Lower clear round percentage and higher average faults indicate more challenging courses.</p>
      <section className={CARD}>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr><th className={TH}>Class</th><th className={`${TH} ${NUM}`}>Height</th><th className={`${TH} ${NUM}`}>Starters</th><th className={`${TH} ${NUM}`}>Clear %</th><th className={`${TH} ${NUM}`}>Avg Faults</th><th>Difficulty Score</th></tr></thead>
          <tbody>
            {a.classes.map((c) => {
              const av = Number(c.avg_faults);
              const [lbl, cls] = av >= 7 ? ['Very High', BADGE.red] : av >= 5 ? ['High', BADGE.red] : av >= 3 ? ['Medium', BADGE.blue] : av >= 1.5 ? ['Moderate', BADGE.gray] : ['Low', BADGE.green];
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
            })}
          </tbody>
        </table>
        </div>
      </section>

      <h2 className={H2}>Class Results</h2>
      <p className={SUB}>Every round of this event, grouped by class — expand to inspect placings, faults and points.</p>
      <ClassResults groups={groups} />

      <h2 className={H2}>Competition Performance Analytics</h2>
      <p className={SUB}>Real-time physical metric tracking across rounds</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className={CARD}>
          <h2 className={H2}>Clear Round Distribution by Height</h2>
          {hb.map((b) => (
            <div className="my-3" key={b.label}>
              <div className="flex justify-between text-[13px] mb-[5px]"><span className="text-muted">{b.label}</span><span className="text-gold font-semibold">{b.p.toFixed(0)}%</span></div>
              <div className="bg-line rounded h-2"><div className="h-2 rounded bg-gold" style={{ width: `${b.p}%` }} /></div>
            </div>
          ))}
        </section>
        <section className={CARD}>
          <h2 className={H2}>Fault Distribution Across Rounds</h2>
          {fb.map((x) => (
            <div className="my-3" key={x.label}>
              <div className="flex justify-between text-[13px] mb-[5px]"><span className="text-muted">{x.label}</span><span className="font-semibold" style={{ color: x.color }}>{x.p.toFixed(0)}% of rounds</span></div>
              <div className="bg-line rounded h-2"><div className="h-2 rounded" style={{ width: `${x.p}%`, background: x.color }} /></div>
            </div>
          ))}
        </section>
      </div>

      <h2 className={H2}>Top Performing Horses</h2>
      <p className={SUB}>Leading equine ranking generated for the {e.name} class structure.</p>
      <section className={CARD}>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr><th className={TH}>Rank</th><th className={TH}>Horse Name</th><th className={TH}>Rider Name</th><th className={TH}>Height Class</th><th className={`${TH} ${NUM}`}>Jump Faults</th><th className={TH}>Time</th><th>Placing</th></tr></thead>
          <tbody>
            {a.horses.map((h, i) => (
              <tr key={h.horse_id}>
                <td className={i === 0 ? 'text-gold font-bold' : ''}>#{i + 1}</td>
                <td className={TD}><b>{h.horse}</b></td>
                <td className={TD}>{h.rider}</td>
                <td className={TD}>{h.height_cm ? `${(Number(h.height_cm) / 100).toFixed(2)}m` : '–'}</td>
                <td className={`${TD} ${NUM} ${Number(h.jump_faults) === 0 ? 'text-moss' : 'text-blood'}`}>{h.jump_faults}</td>
                <td className={TD}>{h.time_seconds === null ? '–' : `${h.time_seconds}s`}</td>
                <td className={TD}>{i === 0 ? <span className={badge(BADGE.goldfill)}>{ordinal(h.finish_place)}</span> : ordinal(h.finish_place)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <h2 className={H2}>Top Performing Riders</h2>
      <p className={SUB}>Leading national showjumping athletes calculated by circuit performance index.</p>
      <section className={CARD}>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr><th className={TH}>Rank</th><th className={TH}>Rider Name</th><th className={TH}>Horses Ridden</th><th className={TH}>Rounds</th><th className={`${TH} ${NUM}`}>Clear %</th><th className={`${TH} ${NUM}`}>Avg Faults</th></tr></thead>
          <tbody>
            {a.riders.map((r, i) => (
              <tr key={r.rider_id}>
                <td className={i === 0 ? 'text-gold font-bold' : ''}>#{i + 1}</td>
                <td className={TD}><b>{r.rider}</b></td>
                <td className={TD}>{r.horses_ridden} Horse{r.horses_ridden === 1 ? '' : 's'}</td>
                <td className={TD}>{r.starts} Round{r.starts === 1 ? '' : 's'}</td>
                <td className={`${TD} ${NUM} text-moss`}>{pct1(r.clear_pct)}</td>
                <td className={`${TD} ${NUM}`}>{Number(r.avg_faults).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <h2 className={H2}>Best Horse-Rider Combinations</h2>
      <p className={SUB}>Consolidated team index evaluating the strongest competitive partnerships.</p>
      <section className={CARD}>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr><th className={TH}>Combination</th><th className={TH}>Rounds</th><th className={`${TH} ${NUM}`}>Clear %</th><th className={`${TH} ${NUM}`}>Avg Faults</th><th>Best Result</th></tr></thead>
          <tbody>
            {a.partnerships.map((p, i) => (
              <tr key={`${p.horse}-${p.rider}`}>
                <td className={TD}><b>{p.horse} + {p.rider}</b></td>
                <td className={TD}>{p.rounds} Round{p.rounds === 1 ? '' : 's'}</td>
                <td className={`${TD} ${NUM} text-moss`}>{pct1(p.clear_pct)}</td>
                <td className={`${TD} ${NUM}`}>{Number(p.avg_faults).toFixed(2)}</td>
                <td className={TD}>{i === 0 ? <span className={badge(BADGE.goldfill)}>{ordinal(p.best_place)} Place</span> : `${ordinal(p.best_place)} Place`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <h2 className={H2}>Arena Intelligence</h2>
      <p className={SUB}>Underlying arena texture physical impact analysis.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className={CARD}>
          <div className="flex items-center justify-between mb-2">
            <h2 className={H2}>Active Arena Profile: {e.arena_type}</h2>
            <span className={badge(BADGE.gold)}>Highly Technical</span>
          </div>
          <div className="flex justify-between py-[9px] border-b border-rowline last:border-0 text-sm"><span className="text-muted">Average Faults<br /><span className="text-xs">Regional penalty index</span></span><span className="font-semibold">{Number(arena.avg_faults).toFixed(2)}</span></div>
          <div className="flex justify-between py-[9px] border-b border-rowline last:border-0 text-sm"><span className="text-muted">Clear Round Rate<br /><span className="text-xs">vs {bestArena.arena} surfaces</span></span><span className="font-semibold text-moss">{pct1(arena.clear_pct)}</span></div>
          <div className="flex justify-between py-[9px] border-b border-rowline last:border-0 text-sm"><span className="text-muted">Total Rounds<br /><span className="text-xs">{arena.rounds >= 200 ? 'Above 200-round threshold' : 'Growing sample'}</span></span><span className="font-semibold">{arena.rounds} Rounds</span></div>
          <div className="flex justify-between py-[9px] border-b border-rowline last:border-0 text-sm"><span className="text-muted">Top Horse Surface Match<br /><span className="text-xs">Trajectory compatibility</span></span><span className="font-semibold">{arena.top_horse || '—'}</span></div>
        </section>
        <section className={CARD}>
          <h2 className={H2}>Comparative Surface Index</h2>
          {arenas.data.map((x) => (
            <div className="my-3" key={x.arena}>
              <div className="flex justify-between text-[13px] mb-[5px]"><span className="text-muted">{x.arena}{x.arena === e.arena_type ? ` (${e.region || 'NZ'})` : ''}</span><span className="font-semibold">{pct1(x.clear_pct).replace('.0%', '%')} Clear · {Number(x.avg_faults).toFixed(1)} Avg Faults</span></div>
              <div className="bg-line rounded h-2"><div className="h-2 rounded" style={{ width: `${x.clear_pct}%`, background: arenaColors[x.arena] }} /></div>
            </div>
          ))}
        </section>
      </div>

      <h2 className={H2}>Event Benchmarking</h2>
      <p className={SUB}>{e.name} vs National, Regional, A-Grade Average.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="bg-card border border-line rounded p-4">
          <div className="text-[11px] text-muted uppercase">Clear Round Rate <span className="text-blood font-bold">{clearPct < circClear ? 'Harder Course' : 'Softer Course'}</span></div>
          <div className="text-[30px] font-extrabold mt-1">{clearPct.toFixed(0)}%</div>
          <div className="text-xs text-muted">{circClear.toFixed(0)}% Avg</div>
        </div>
        <div className="bg-card border border-line rounded p-4">
          <div className="text-[11px] text-muted uppercase">Average Faults <span className="text-blood font-bold">{avgF > circAvg ? 'Higher Penalties' : 'Lower Penalties'}</span></div>
          <div className="text-[30px] font-extrabold mt-1">{avgF.toFixed(1)}</div>
          <div className="text-xs text-muted">{circAvg.toFixed(1)} Avg</div>
        </div>
        <div className="bg-card border border-line rounded p-4">
          <div className="text-[11px] text-muted uppercase">Field Strength <span className="text-moss font-bold">{score >= circScore ? 'Elite Field' : 'Open Field'}</span></div>
          <div className="text-[30px] font-extrabold mt-1">{strength}</div>
          <div className="text-xs text-muted">{strengthLabel(circScore)}</div>
        </div>
      </div>

      <h2 className={H2}>Historical Event Trends</h2>
      <p className={SUB}>Longitudinal metrics across showjumping seasons.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className={CARD}>
          <h2 className={H2}>Participation Volume Trend</h2>
          <MiniTrend points={months} color="#FFD700" />
        </section>
        <section className={CARD}>
          <h2 className={H2}>Historical Course Difficulty Index</h2>
          <MiniTrend points={diffm} color="#FF1744" />
        </section>
      </div>

      <h2 className={H2}>Event Rankings</h2>
      <p className={SUB}>Segmented micro rankings calculated on current {e.name} metrics.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="bg-card border border-line rounded p-4">
          <div className="text-[13px] font-bold mb-2">Best Horses (EQ Score)</div>
          {evHorses.map((x, i) => <div key={x.horse} className="flex justify-between text-[13px] py-1"><span>#{i + 1} {x.horse}</span><span className="text-muted">EQ {x.eq}</span></div>)}
        </div>
        <div className="bg-card border border-line rounded p-4">
          <div className="text-[13px] font-bold mb-2">Best Riders (Performance)</div>
          {evRiders.map((x, i) => <div key={x.rider} className="flex justify-between text-[13px] py-1"><span>#{i + 1} {x.rider}</span><span className="text-muted">Index {x.eq}</span></div>)}
        </div>
        <div className="bg-card border border-line rounded p-4">
          <div className="text-[13px] font-bold mb-2">Best Partnerships</div>
          {evParts.map((x, i) => <div key={`${x.horse}-${x.rider}`} className="flex justify-between text-[13px] py-1"><span>#{i + 1} {x.horse} + {x.rider.split(' ')[0]}</span><span className="text-muted">{x.match} Match</span></div>)}
        </div>
      </div>

      <h2 className={H2}>EQIndex Intelligence Insights</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {insights.map((t, i) => (
          <div className="bg-card border border-line rounded p-4" key={i}>
            <span className={badge(BADGE.red)}>⚠ ACTIVE SIGNAL</span>
            <p className="text-[13px] mt-2 mb-0">{t}</p>
          </div>
        ))}
      </div>

      <h2 className={H2}>Interactive Tools & Actions</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          ['Compare This Event', 'Contrast with another regional arena', '/comparison'],
          ['View Horses Entered', 'Isolate individual equine metrics', '/horses'],
          ['View Riders Entered', 'Evaluate athlete index ratings', '/riders'],
          ['Explore Class Rankings', 'Detailed class difficulty index', '/analytics'],
        ].map(([t, d, href]) => (
          <a key={t} href={href} className="bg-card border border-line rounded p-4 no-underline hover:border-gold">
            <div className="text-[13px] font-bold text-body">{t}</div>
            <div className="text-xs text-muted mt-1">{d}</div>
          </a>
        ))}
      </div>
    </>
  );
}
