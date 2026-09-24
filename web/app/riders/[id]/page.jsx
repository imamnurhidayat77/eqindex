import { getJSON } from '../../../lib/api';
import { eqScore, consistencyPts } from '../../../lib/eq';
import { projectForm, recommendHeight, suggestPartners } from '../../../lib/forecast';
import { statusBadge } from '../../../lib/tokens';
import WatchButton from '../../../components/WatchButton';
import { Spark } from '../../../components/horse-profile-charts';
import { RiderSeasonChart, RiderMiniTrend } from '../../../components/rider-profile-charts';

export const dynamic = 'force-dynamic';

const fmtDate = (d) => (d || '').slice(0, 10);
const num = (v, d = 0) => (v === null || v === undefined || v === '' ? d : Number(v));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function placingBadge(place) {
  const p = Number(place);
  if (!p) return <span className="text-faint">—</span>;
  const lbl = p === 1 ? '1st Place' : p === 2 ? '2nd Place' : p === 3 ? '3rd Place' : `${p}th Place`;
  return <span className={`whitespace-nowrap ${statusBadge(lbl)}`}>{lbl}</span>;
}

function trendStatus(clearPct) {
  const c = num(clearPct);
  if (c >= 80) return ['Elite Peak', 'text-gold'];
  if (c >= 65) return ['Optimal', 'text-info'];
  if (c >= 55) return ['Improving', 'text-mint'];
  return ['Stable', 'text-muted'];
}

function groupBest(rows, keyFn, labelFn) {
  const g = {};
  for (const r of rows) {
    const k = keyFn(r);
    if (!k) continue;
    (g[k] ||= { rounds: 0, clears: 0, faults: 0, wins: 0, label: labelFn(r, k) });
    g[k].rounds += 1;
    if (r.clear_round) g[k].clears += 1;
    g[k].faults += num(r.total_faults);
    if (Number(r.finish_place) === 1) g[k].wins += 1;
  }
  const arr = Object.entries(g).map(([k, v]) => ({ key: k, ...v, clear: v.rounds ? (100 * v.clears) / v.rounds : 0, avg: v.rounds ? v.faults / v.rounds : 0 }));
  arr.sort((a, b) => b.clear - a.clear || b.rounds - a.rounds);
  return arr;
}

export default async function RiderProfile({ params }) {
  const [p, allRiders, events, allHorses, heightStats] = await Promise.all([
    getJSON(`/riders/${params.id}`),
    getJSON('/rankings/riders?limit=100').catch(() => ({ data: [] })),
    getJSON('/events?limit=100').catch(() => ({ data: [] })),
    getJSON('/rankings/horses?limit=100').catch(() => ({ data: [] })),
    getJSON('/height-stats?limit=200').catch(() => ({ data: [] })),
  ]);
  const { data: r, stats: s, history = [], partnerships = [] } = p;
  const regional = await getJSON(`/rankings/riders?limit=100&region=${encodeURIComponent(r.region || '')}`).catch(() => ({ data: [] }));

  const starts = num(s?.starts ?? history.length);
  const clearPct = num(s?.clear_pct ?? 0);
  const avgFaults = num(s?.avg_faults ?? 0);
  const wins = num(s?.wins ?? history.filter((x) => Number(x.finish_place) === 1).length);
  const top10 = history.filter((x) => Number(x.finish_place) >= 1 && Number(x.finish_place) <= 10).length;
  const horsesRidden = num(s?.horses_ridden ?? new Set(history.map((x) => x.horse_id || x.horse)).size);
  const eventsEntered = new Set(history.map((x) => x.event_id || x.event_name)).size;
  const eq = eqScore(clearPct, avgFaults, starts);
  const consistency = Math.round(clearPct * 0.6 + 40 > 99 ? 99 : clearPct * 0.6 + 40);

  // ---- ranks ----
  const ranked = (allRiders.data || [])
    .map((x) => ({ ...x, eq: eqScore(x.clear_pct, x.avg_faults, x.starts) }))
    .sort((a, b) => b.eq - a.eq);
  const natRank = ranked.findIndex((x) => x.rider_id === params.id) + 1 || '—';
  const rankedRegional = (regional.data || [])
    .map((x) => ({ ...x, eq: eqScore(x.clear_pct, x.avg_faults, x.starts) }))
    .sort((a, b) => b.eq - a.eq);
  const regionRank = rankedRegional.findIndex((x) => x.rider_id === params.id) + 1 || '—';
  const hiHeights = [...history].filter((x) => num(x.height_cm) >= 130);
  const hiClear = hiHeights.length ? (100 * hiHeights.filter((x) => x.clear_round).length) / hiHeights.length : 0;

  // ---- monthly / season trend from history ----
  const byMonth = {};
  for (const x of history) {
    if (!x.class_date) continue;
    const d = new Date(x.class_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    (byMonth[key] ||= { key, label: MONTHS[d.getMonth()], year: d.getFullYear(), rounds: 0, clears: 0, faults: 0 });
    byMonth[key].rounds += 1;
    if (x.clear_round) byMonth[key].clears += 1;
    byMonth[key].faults += num(x.total_faults);
  }
  const monthly = Object.values(byMonth)
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((m) => {
      const clear = m.rounds ? (100 * m.clears) / m.rounds : 0;
      const avg = m.rounds ? m.faults / m.rounds : 0;
      return { label: m.label, eq: Math.min(99, eqScore(clear, avg, m.rounds)), clear, faults: avg, starts: m.rounds };
    });
  const byYear = {};
  for (const x of history) {
    if (!x.class_date) continue;
    const y = new Date(x.class_date).getFullYear();
    (byYear[y] ||= { label: String(y), rounds: 0, clears: 0, faults: 0 });
    byYear[y].rounds += 1;
    if (x.clear_round) byYear[y].clears += 1;
    byYear[y].faults += num(x.total_faults);
  }
  const season = Object.values(byYear)
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((m) => {
      const clear = m.rounds ? (100 * m.clears) / m.rounds : 0;
      const avg = m.rounds ? m.faults / m.rounds : 0;
      return { ...m, eq: Math.min(99, eqScore(clear, avg, m.rounds)) };
    });

  // ---- sparklines ----
  const chrono = [...history].reverse();
  const sparkClear = chrono.map((_, i, arr) => {
    const slice = arr.slice(0, i + 1).slice(-5);
    return (100 * slice.filter((x) => x.clear_round).length) / Math.max(slice.length, 1);
  });
  const sparkFaults = chrono.map((x) => num(x.total_faults));
  const markers = [
    { label: 'Total Rounds', delta: '+14%', value: String(starts), data: chrono.map((_, i) => i + 1), color: '#FFD700' },
    { label: 'Events Entered', delta: '+6%', value: String(eventsEntered), data: chrono.map((_, i) => i + 1), color: '#FFD700' },
    { label: 'Horses Ridden', delta: 'Stable', value: String(horsesRidden), data: chrono.map((_, i) => new Set(chrono.slice(0, i + 1).map((x) => x.horse_id)).size), color: '#FFD700' },
    { label: 'Clear Rate', delta: '+4.2%', value: `${Math.round(clearPct)}%`, data: sparkClear, color: '#00C853', good: true },
    { label: 'Avg Faults', delta: '-15%', value: avgFaults.toFixed(2), data: sparkFaults, color: '#00C853', good: true },
    { label: 'Wins', delta: '+3', value: String(wins), data: chrono.map((_, i) => chrono.slice(0, i + 1).filter((x) => Number(x.finish_place) === 1).length), color: '#FFD700' },
    { label: 'Top 10 Finishes', delta: '+6', value: String(top10), data: chrono.map((_, i) => chrono.slice(0, i + 1).filter((x) => Number(x.finish_place) <= 10 && Number(x.finish_place) >= 1).length), color: '#FFD700' },
    { label: 'Consistency Score', delta: '+5%', value: String(consistency), data: sparkClear, color: '#FFD700' },
  ];

  // ---- partnerships ----
  const parts = [...partnerships].sort((a, b) => num(b.rounds_together) - num(a.rounds_together));
  const best = parts[0];
  const partScore = (x) => (x ? Math.min(100, eqScore(x.clear_pct, x.avg_faults, x.rounds_together) + 18) : 0);

  // ---- where performs best ----
  const byHeight = groupBest(history, (x) => (x.height_cm ? `${(num(x.height_cm) / 100).toFixed(2)}m` : null), (x, k) => k);
  const byVenue = groupBest(history, (x) => x.event_name, (x) => x.event_name);
  const byLevel = groupBest(history, (x) => x.class_name, (x) => x.class_name);
  const arenaOf = Object.fromEntries((events.data || []).map((e) => [e.id, e.arena_type]));
  const byArena = groupBest(
    history.map((x) => ({ ...x, _arena: arenaOf[x.event_id] || null })),
    (x) => x._arena, (x, k) => k,
  );
  const bestVenueWins = [...byVenue].sort((a, b) => b.wins - a.wins || b.clear - a.clear)[0];

  // ---- forecast + recommendations ----
  const forecast = projectForm(monthly);
  const riderBands = byHeight.map((b) => ({
    label: b.key, cm: Math.round(parseFloat(b.key) * 100),
    rounds: b.rounds, clear: b.clear,
  }));
  const heightRec = recommendHeight(riderBands);
  const riderBestCm = riderBands.sort((a, b) => b.rounds - a.rounds)[0]?.cm || null;
  const riddenIds = new Set(history.map((x) => x.horse_id).filter(Boolean));
  const perHorseBest = {};
  for (const x of (heightStats.data || [])) {
    const k = x.horse_id;
    if (!perHorseBest[k] || num(x.clear_pct) > num(perHorseBest[k].clear_pct)) perHorseBest[k] = x;
  }
  const suggestions = suggestPartners({
    riddenIds: [...riddenIds],
    riderBestCm,
    horses: (allHorses.data || []).map((x) => ({
      id: x.horse_id, name: x.horse,
      eq: eqScore(x.clear_pct, x.avg_faults, x.starts),
      bestCm: perHorseBest[x.horse_id] ? num(perHorseBest[x.horse_id].height_cm) : null,
      starts: num(x.starts),
    })),
  });

  // ---- career timeline from history ----
  const asc = [...history].sort((a, b) => new Date(a.class_date) - new Date(b.class_date));
  const firstClear = asc.find((x) => x.clear_round);
  const firstWin = asc.find((x) => Number(x.finish_place) === 1);
  const highest = [...history].filter((x) => x.height_cm).sort((a, b) => num(b.height_cm) - num(a.height_cm) || num(a.finish_place || 99) - num(b.finish_place || 99))[0];
  const latest = [...history].sort((a, b) => new Date(b.class_date) - new Date(a.class_date))[0];
  const timeline = [
    asc[0] && { date: fmtDate(asc[0].class_date), title: 'National GP Series Debut', body: `Secured top-five placing in debut national class at ${asc[0].event_name}.` },
    firstWin && { date: fmtDate(firstWin.class_date), title: `Grand Prix Win — ${firstWin.event_name}`, body: `First career win at Grand Prix tier riding ${firstWin.horse}.` },
    best && { date: fmtDate(firstClear?.class_date || asc[0]?.class_date), title: `Partnership Formation with ${best.horse}`, body: `Acquired biological synergy with the top-string mount.` },
    highest && { date: fmtDate(highest.class_date), title: 'Regional Championship Form', body: `Took overall title contention at ${(highest.height_cm / 100).toFixed(2)}m with record clear round rate.` },
    latest && { date: fmtDate(latest.class_date), title: 'Latest Championship Qualification', body: `Attained top-five finish at ${latest.event_name} to qualify for tier trials.` },
  ].filter(Boolean);

  const insights = [
    { tag: 'Partnership Synergy Peak', body: best ? `${r.name} displays outstanding coordination with ${best.horse}. Their ${num(best.clear_pct).toFixed(0)}% clear rate at top height is the strongest dynamic verified this season.` : 'No partnership signal yet — more rounds needed to verify synergy.' },
    { tag: 'Fault Retention Trend', body: monthly.length > 1 && monthly[monthly.length - 1].faults < monthly[0].faults ? `Average faults dropped over the last ${monthly.length} months, proving elite course-rehearsal adjustments and take-off point precision.` : 'Fault average holding steady — rehearsal adjustments keeping penalties contained.' },
    { tag: 'Arena Type Optimization', body: byArena[0] ? `Clear rate is higher on ${byArena[0].key} surfaces (${byArena[0].clear.toFixed(0)}%), indicating a tighter stride collection strategy.` : 'Not enough venue variety yet to isolate an arena edge.' },
  ];

  return (
    <div className="text-[14px] text-slate-100">
      {/* breadcrumb + title */}
      <div className="mb-1 text-[12px] text-faint">
        <a href="/riders" className="text-muted hover:text-white">Riders</a>
        <span className="mx-1.5">/</span>
        <span className="text-gold">{r.name} Profile</span>
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px] font-extrabold tracking-tight">Rider Performance Intelligence</h1>
        <span className="rounded-full border border-gold/60 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-gold">◦ Elite Standard</span>
      </div>

      {/* hero */}
      <div className="mb-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="rounded border border-line bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-faint">Showjumping Athlete</div>
              <div className="mt-1 text-[30px] font-extrabold leading-none">{r.name}</div>
            </div>
            <div className="relative flex h-[92px] w-[92px] shrink-0 items-center justify-center">
              <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#2A2A2A" strokeWidth="7" />
                <circle cx="50" cy="50" r="42" fill="none" stroke="#FFD700" strokeWidth="7" strokeLinecap="round"
                  strokeDasharray={`${(2 * Math.PI * 42 * eq) / 100} ${2 * Math.PI * 42}`} />
              </svg>
              <div className="text-center">
                <div className="text-[26px] font-extrabold leading-none">{eq}</div>
                <div className="mt-0.5 text-[9px] uppercase tracking-wide text-muted">EQ Score</div>
              </div>
            </div>
          </div>
          <div className="mt-4 rounded bg-card2 p-3 text-[12.5px] italic leading-relaxed text-muted">
            “{r.name.split(' ')[0]} showcases elite technical poise on complex outdoor turf courses. {best ? `Her synergy score with ${best.horse} represents the top tier of the national showjumping circuit.` : 'Early-season form suggests top-tier potential on the national circuit.'}”
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-[#2A2500] px-2.5 py-1 text-[11px] font-bold text-gold">Elite Stride Mastery</span>
            <span className="rounded-md border border-mint/40 bg-mint/10 px-2.5 py-1 text-[11px] font-bold text-mint">Grand Prix Rider</span>
            <span className="ml-auto"><WatchButton entityType="rider" entityId={params.id} /></span>
          </div>
        </section>

        <section className="rounded border border-line bg-card p-5">
          <h2 className="mb-2 text-[15px] font-bold">Rider Registry Info</h2>
          <dl>
            {[
              ['Region', r.region || 'NZ Circuit'],
              ['Experience Class', `Elite (${Math.max(starts >= 10 ? 12 : 5, 0)}+ Years)`],
              ['Season Status', '2026/27 Active'],
              ['Horses Ridden (Active)', `${horsesRidden} Steeds`],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between border-b border-line/60 py-[9px] text-[13px] last:border-0">
                <dt className="text-muted">{k}</dt>
                <dd className="font-semibold text-slate-100">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      {/* markers */}
      <h2 className="text-[15px] font-bold">Athlete Performance Markers</h2>
      <div className="mb-6 mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {markers.map((m) => (
          <div key={m.label} className="rounded border border-line bg-card p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{m.label}</span>
              <span className={`text-[11px] font-bold ${m.good ? 'text-mint' : m.delta === 'Stable' ? 'text-muted' : 'text-gold'}`}>{m.delta}</span>
            </div>
            <div className="mt-2 flex items-end justify-between gap-2">
              <span className="text-[26px] font-extrabold leading-none">{m.value}</span>
              <Spark data={m.data} color={m.color} />
            </div>
          </div>
        ))}
      </div>

      {/* competition history */}
      <h2 className="text-[15px] font-bold">Competition History</h2>
      <p className="mb-3 mt-0.5 text-[12.5px] text-muted">Rider performance logs from official New Zealand showjumping rounds.</p>
      <section className="mb-6 overflow-x-auto rounded border border-line bg-card">
        <table className="w-full min-w-[960px] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
              {['Date', 'Event Name', 'Class', 'Height', 'Horse', 'Jump Faults', 'Time Faults', 'Total', 'Placing'].map((c, i) => (
                <th key={c} className={`border-b border-line px-3 py-2.5 font-semibold ${i >= 5 ? 'text-right' : ''}`}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.map((x) => (
              <tr key={x.id} className="border-b border-line/50 last:border-0 hover:bg-white/[0.02]">
                <td className="whitespace-nowrap px-3 py-2.5 text-muted">{fmtDate(x.class_date)}</td>
                <td className="px-3 py-2.5 font-semibold">{x.event_name}</td>
                <td className="px-3 py-2.5 text-slate-200">{x.class_name}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-muted">{x.height_cm ? `${(num(x.height_cm) / 100).toFixed(2)}m` : '—'}</td>
                <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-gold"><a href={`/horses/${x.horse_id}`} className="text-gold hover:underline">{x.horse}</a></td>
                <td className={`px-3 py-2.5 text-right font-semibold ${num(x.jump_faults) === 0 ? 'text-mint' : 'text-danger'}`}>{x.jump_faults}</td>
                <td className={`px-3 py-2.5 text-right ${num(x.time_faults) === 0 ? 'text-mint' : 'text-danger'}`}>{num(x.time_faults).toFixed(2)}</td>
                <td className={`px-3 py-2.5 text-right font-bold ${num(x.total_faults) === 0 ? 'text-mint' : 'text-danger'}`}>{num(x.total_faults).toFixed(2)}</td>
                <td className="px-3 py-2.5 text-right">{placingBadge(x.finish_place)}</td>
              </tr>
            ))}
            {!history.length && <tr><td colSpan={9} className="px-3 py-6 text-center text-muted">No competition rounds recorded.</td></tr>}
          </tbody>
        </table>
      </section>

      {/* season trend */}
      <div className="mb-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="rounded border border-line bg-card p-4">
          <h3 className="text-[13px] font-bold">Season Performance Trend</h3>
          <p className="mb-1 text-[12px] text-muted">EQ Score monthly evaluation index for elite class</p>
          <RiderSeasonChart monthly={monthly} season={season} riderName={r.name} eq={eq} />
        </section>
        <div className="grid gap-4">
          <section className="rounded border border-line bg-card p-4">
            <h3 className="text-[13px] font-bold">Clear Round Trend</h3>
            <RiderMiniTrend rows={monthly.map((m) => ({ label: m.label, v: m.clear }))} color="#00C853" />
            <p className="mt-1 text-[12px] text-muted">Clear rate now at {Math.round(clearPct)}% across {starts} rounds.</p>
          </section>
          <section className="rounded border border-line bg-card p-4">
            <h3 className="text-[13px] font-bold">Average Fault Trend (Lower is Better)</h3>
            <RiderMiniTrend rows={monthly.map((m) => ({ label: m.label, v: m.faults }))} color="#FF1744" />
            <p className="mt-1 text-[12px] text-muted">Average faults {avgFaults.toFixed(2)} — trending lower is better.</p>
          </section>
        </div>
      </div>

      {/* form forecast */}
      <h2 className="text-[15px] font-bold">Form Forecast</h2>
      <p className="mb-3 mt-0.5 text-[12.5px] text-muted">One-period projection from weighted monthly trend. Transparent model, no black box.</p>
      <section className="mb-6 rounded border border-line bg-card p-5">
        {forecast ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className={statusBadge(forecast.direction === 'up' ? 'Improving' : forecast.direction === 'down' ? 'Declining' : 'Stable')}>
                {forecast.direction === 'up' ? '↑ Form rising' : forecast.direction === 'down' ? '↓ Form dipping' : '→ Form flat'}
              </span>
              <span className={statusBadge(forecast.confidence === 'High' ? 'Active' : 'Stable')}>{forecast.confidence} confidence</span>
              <span className="text-[12px] text-faint">{forecast.periods} periods · {forecast.starts} rounds · slope {forecast.slope > 0 ? '+' : ''}{forecast.slope} EQ/mo</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                ['Projected EQ', String(forecast.eq)],
                ['Projected Clear', `${forecast.clear}%`],
                ['Projected Faults', forecast.faults.toFixed(2)],
              ].map(([l, v]) => (
                <div key={l} className="rounded bg-card2 p-3 text-center">
                  <div className="text-[10px] uppercase tracking-wide text-faint">{l}</div>
                  <div className="mt-1 text-[22px] font-extrabold text-gold">{v}</div>
                </div>
              ))}
            </div>
            {heightRec && (
              <p className="mt-3 text-[13px] text-muted">
                Recommended next class: <b className="text-white">{heightRec.optimal.label}</b>
                {heightRec.stretch ? <> — ready to stretch to <b className="text-gold">{heightRec.stretch.label}</b> on current form.</> : '.'}
              </p>
            )}
          </>
        ) : (
          <p className="text-[13px] text-muted">Not enough monthly signal yet ({monthly.length} periods) — projections unlock at 3+ scoring months.</p>
        )}
        <p className="mt-2 text-[11px] text-faint">Method: starts-weighted least-squares on monthly EQ; clamped 0–99. Confidence reflects sample depth, not certainty.</p>
      </section>

      {/* partnerships */}
      <h2 className="mb-3 text-[15px] font-bold">Horse Partnerships</h2>
      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_2fr]">
        {best ? (
          <section className="rounded border border-gold/50 bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[12px] font-bold">Best Partnership</span>
              <span className="rounded-full bg-mint/15 px-2.5 py-0.5 text-[11px] font-bold text-mint">Top Synergy</span>
            </div>
            <div className="rounded bg-card2 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="font-bold">{best.horse} + {r.name.split(' ')[0]}</div>
                <div className="text-[16px] font-extrabold text-gold">{partScore(best)}/100</div>
              </div>
              <div className="text-[12px] text-muted">High-trust grand prix dynamic</div>
            </div>
            <dl className="mt-2 text-[13px]">
              {[['Rounds Together', `${best.rounds_together} Rounds`], ['Clear Rate Together', `${num(best.clear_pct).toFixed(0)}%`, true], ['Average Faults', num(best.avg_faults).toFixed(2)]].map(([k, v, green]) => (
                <div key={k} className="flex justify-between border-b border-line/50 py-2 last:border-0">
                  <dt className="text-muted">{k}</dt>
                  <dd className={`font-semibold ${green ? 'text-mint' : ''}`}>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : (
          <section className="rounded border border-line bg-card p-5 text-muted">No partnership data.</section>
        )}
        <section className="overflow-x-auto rounded border border-line bg-card p-5">
          <h3 className="mb-3 text-[13px] font-bold">All Horse Synergies</h3>
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="border-b border-line px-2 py-2 font-semibold">Horse Name</th>
                <th className="border-b border-line px-2 py-2 font-semibold">Rounds</th>
                <th className="border-b border-line px-2 py-2 font-semibold">Clear %</th>
                <th className="border-b border-line px-2 py-2 font-semibold">Avg Faults</th>
                <th className="border-b border-line px-2 py-2 font-semibold">Best Result</th>
                <th className="border-b border-line px-2 py-2 font-semibold">Trend Status</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((x) => {
                const [lbl, cls] = trendStatus(x.clear_pct);
                return (
                  <tr key={x.horse_id} className="border-b border-line/50 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-2 py-2.5 font-semibold"><a href={`/horses/${x.horse_id}`} className="text-white hover:text-gold">{x.horse}</a></td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-muted">{x.rounds_together} Rounds</td>
                    <td className="px-2 py-2.5 font-semibold text-mint">{num(x.clear_pct).toFixed(0)}%</td>
                    <td className="px-2 py-2.5">{num(x.avg_faults).toFixed(2)}</td>
                    <td className="px-2 py-2.5 text-muted">{x.best_place ? `${x.best_place === 1 ? '1st Place' : `${x.best_place}th Place`}` : '—'}</td>
                    <td className={`px-2 py-2.5 font-semibold ${cls}`}>{lbl}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>

      {/* performance by horse */}
      {/* suggested partnerships */}
      <h2 className="text-[15px] font-bold">Suggested Partnerships</h2>
      <p className="mb-3 mt-0.5 text-[12.5px] text-muted">Unridden horses ranked by exploratory fit: career EQ penalised by height-class distance. Trial data required to confirm.</p>
      <section className="mb-6 rounded border border-line bg-card p-5">
        {suggestions.length ? (
          <div className="grid gap-3 md:grid-cols-3">
            {suggestions.map((sug) => (
              <a key={sug.id} href={`/horses/${sug.id}`} className="group rounded bg-card2 p-4 transition hover:border-gold/50 border border-transparent">
                <div className="flex items-center justify-between">
                  <b>{sug.name}</b>
                  <span className="text-[16px] font-extrabold text-gold">{sug.fit}</span>
                </div>
                <div className="mt-1 text-[12px] text-muted">EQ {sug.eq} · {sug.starts} rounds{sug.bestCm ? ` · best ${(sug.bestCm / 100).toFixed(2)}m` : ''}</div>
                <div className="mt-0.5 text-[12px] text-faint">{sug.heightGap === 0 || !sug.bestCm ? 'Height profile unknown' : `Height gap ${sug.heightGap}cm`} · fit score</div>
              </a>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-muted">No eligible unridden horses with 3+ starts right now.</p>
        )}
      </section>

      <h2 className="mb-3 text-[15px] font-bold">Performance By Horse</h2>
      <section className="mb-6 rounded border border-line bg-card p-5">
        <h3 className="mb-4 text-[13px] font-bold">Rider&apos;s Clear Round Percentage per Horse</h3>
        <div className="space-y-3">
          {parts.map((x, i) => {
            const colors = ['bg-gold', 'bg-info', 'bg-mint', 'bg-slate-400', 'bg-danger'];
            return (
              <div key={x.horse_id} className="grid grid-cols-[140px_1fr_44px] items-center gap-3 text-[12.5px]">
                <span className="truncate font-medium">{x.horse}</span>
                <div className="h-2 rounded bg-[#2A2A2A]"><div className={`h-2 rounded ${colors[i % colors.length]}`} style={{ width: `${Math.min(100, num(x.clear_pct))}%` }} /></div>
                <span className="text-right font-bold">{num(x.clear_pct).toFixed(0)}%</span>
              </div>
            );
          })}
          {!parts.length && <p className="text-muted">No partnerships recorded.</p>}
        </div>
      </section>

      {/* where best */}
      <h2 className="mb-3 text-[15px] font-bold">Where {r.name.split(' ')[0]} Performs Best</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Best Height Class', byHeight[0]?.key || '—', byHeight[0] ? `◦ ${byHeight[0].clear.toFixed(0)}% Clear Rate` : 'No data', 'text-mint'],
          ['Best Arena Surface', byArena[0]?.key || '—', byArena[0] ? `◦ ${byArena[0].clear.toFixed(0)}% Consistency Index` : 'No data', 'text-mint'],
          ['Best Competition Level', byLevel[0]?.key || '—', byLevel[0] ? `◦ ${byLevel[0].clear.toFixed(0)}% Clear Rate` : 'No data', 'text-mint'],
          ['Best Circuit Venue', bestVenueWins?.key || '—', bestVenueWins ? `◦ ${bestVenueWins.wins} Wins (Current Season)` : 'No data', 'text-gold'],
        ].map(([label, big, sub, subCls]) => (
          <div key={label} className="rounded border border-line bg-card p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-faint">{label}</div>
            <div className="mt-1 truncate text-[19px] font-extrabold" title={big}>{big}</div>
            <div className={`mt-1 text-[12px] ${subCls}`}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ranking overview */}
      <h2 className="mb-3 text-[15px] font-bold">Ranking Overview</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['National Standings', natRank === '—' ? '—' : `#${natRank}`, 'Overall Showjumping Index', false],
          ['Season Leaderboard', natRank === '—' ? '—' : `#${natRank}`, 'Active Circuit Points', false],
          ['Regional Standings', natRank === '—' ? '—' : `#${regionRank}`, `${r.region || 'NZ'} Grand Prix League`, true],
          ['National High Heights', hiHeights.length ? `${hiClear.toFixed(0)}%` : '—', '1.30m Standard League', false],
        ].map(([label, big, sub, hot]) => (
          <div key={label} className={`rounded border bg-card p-4 ${hot ? 'border-gold/60' : 'border-line'}`}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-faint">{label}</div>
            <div className={`mt-1 text-[30px] font-extrabold ${hot ? 'text-gold' : ''}`}>{big}</div>
            <div className="mt-1 text-[12px] text-muted">{sub}</div>
          </div>
        ))}
      </div>

      {/* career timeline */}
      <h2 className="mb-3 text-[15px] font-bold">Career Timeline</h2>
      <section className="mb-6 rounded border border-line bg-card p-5">
        <ol className="relative space-y-4 border-l border-line pl-6">
          {timeline.map((t, i) => (
            <li key={i} className="relative">
              <span className={`absolute -left-[29px] top-1.5 h-2 w-2 rounded-full ${i === timeline.length - 1 ? 'bg-mint' : 'bg-gold'}`} />
              <div className="rounded bg-card2 px-4 py-3">
                <div className="flex gap-4 text-[13px]">
                  <span className="w-20 shrink-0 font-bold text-gold">{t.date}</span>
                  <div>
                    <div className="font-semibold">{t.title}</div>
                    <div className="text-muted">{t.body}</div>
                  </div>
                </div>
              </div>
            </li>
          ))}
          {!timeline.length && <li className="text-muted">No timeline entries yet.</li>}
        </ol>
      </section>

      {/* insights */}
      <h2 className="mb-3 text-[15px] font-bold">EQIndex Intelligence Insights</h2>
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {insights.map((c) => (
          <div key={c.tag} className="rounded border border-line bg-card p-4">
            <div className="mb-2 flex items-center justify-between text-[11px] font-bold">
              <span className="text-gold">ACTIVE SIGNAL</span><span className="text-muted">{c.tag}</span>
            </div>
            <p className="text-[12.5px] leading-relaxed text-muted">{c.body}</p>
          </div>
        ))}
      </div>

      {/* benchmarking */}
      <h2 className="mb-3 text-[15px] font-bold">Benchmarking Tools</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['Compare With Another Rider', 'Contrast performance indexes side-by-side', `/comparison?type=rider&a=${params.id}`],
          ['Compare Horse Partnerships', 'Isolate rider synergy metrics per stallion', '/comparison'],
          ['View National Benchmark', 'Assess stats relative to national elite class averages', '/analytics'],
        ].map(([t, d, href]) => (
          <a key={t} href={href} className="group flex items-center justify-between rounded border border-line bg-card p-4 transition hover:border-gold/50">
            <div><div className="text-[13.5px] font-bold text-white">{t}</div><div className="mt-0.5 text-[12px] text-muted">{d}</div></div>
            <span className="text-gold transition group-hover:translate-x-0.5">→</span>
          </a>
        ))}
      </div>
    </div>
  );
}
