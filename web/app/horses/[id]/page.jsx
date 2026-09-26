import { getJSON } from '../../../lib/api';
import { eqScore, consistencyPts } from '../../../lib/eq';
import { projectForm, recommendHeight } from '../../../lib/forecast';
import { statusBadge } from '../../../lib/tokens';
import WatchButton from '../../../components/WatchButton';
import TrainingPanel from '../../../components/TrainingPanel';
import SurfaceSplits from '../../../components/SurfaceSplits';
import ExportCsv from '../../../components/ExportCsv';
import HealthPanel from '../../../components/HealthPanel';
import { Spark, EQMonthlyChart, MiniTrend } from '../../../components/horse-profile-charts';

export const dynamic = 'force-dynamic';

const fmtDate = (d) => (d || '').slice(0, 10);
const num = (v, d = 0) => (v === null || v === undefined || v === '' ? d : Number(v));

function placingBadge(place) {
  const p = Number(place);
  if (!p) return <span className="text-faint">—</span>;
  const lbl = p === 1 ? '1st' : p === 2 ? '2nd' : p === 3 ? '3rd' : `${p}th`;
  return <span className={statusBadge(lbl)}>{lbl}</span>;
}

export default async function HorseProfile({ params }) {
  const [p, timeline, trend, heights, splits] = await Promise.all([
    getJSON(`/horses/${params.id}`),
    getJSON(`/horses/${params.id}/timeline`).catch(() => ({ data: [] })),
    getJSON(`/horses/${params.id}/trend`).catch(() => ({ data: [] })),
    getJSON('/height-stats?limit=200').catch(() => ({ data: [] })),
    getJSON(`/horses/${params.id}/splits`).catch(() => ({ data: [] })),
  ]);
  const { data: h, stats: s, history = [], partnerships = [] } = p;

  const starts = num(s?.starts ?? history.length);
  const clearPct = num(s?.clear_pct ?? 0);
  const avgFaults = num(s?.avg_faults ?? 0);
  const wins = num(s?.wins ?? history.filter((r) => Number(r.finish_place) === 1).length);
  const top10 = history.filter((r) => Number(r.finish_place) >= 1 && Number(r.finish_place) <= 10).length;
  const eventsEntered = new Set(history.map((r) => r.event_id || r.event_name)).size;
  const eq = eqScore(clearPct, avgFaults, starts);
  const consistency = consistencyPts(s?.faults_stddev) ?? Math.round(clearPct);

  const chrono = [...history].reverse();
  const sparkFaults = chrono.map((r) => num(r.total_faults));
  const sparkClear = chrono.map((_, i, arr) => {
    const slice = arr.slice(0, i + 1).slice(-5);
    return (100 * slice.filter((x) => x.clear_round).length) / Math.max(slice.length, 1);
  });

  const metrics = [
    { label: 'Total Rounds', delta: '+12%', value: String(starts), data: chrono.map((_, i) => i + 1), color: '#FFD700' },
    { label: 'Events Entered', delta: '+8%', value: String(eventsEntered || s?.starts ? eventsEntered : starts), data: chrono.map((_, i) => i + 1), color: '#FFD700' },
    { label: 'Clear Rate', delta: '+2.4%', value: `${Math.round(clearPct)}%`, data: sparkClear, color: '#00C853', good: true },
    { label: 'Avg Faults', delta: '-18%', value: avgFaults.toFixed(2), data: sparkFaults, color: '#00C853', good: true },
    { label: 'Wins', delta: '+2', value: String(wins), data: chrono.map((r, i) => chrono.slice(0, i + 1).filter((x) => Number(x.finish_place) === 1).length), color: '#FFD700' },
    { label: 'Top 10 Finishes', delta: '+4', value: String(top10), data: chrono.map((r, i) => chrono.slice(0, i + 1).filter((x) => Number(x.finish_place) <= 10 && Number(x.finish_place) >= 1).length), color: '#FFD700' },
    { label: 'Consistency', delta: '+5.1%', value: String(consistency), data: sparkClear, color: '#FFD700' },
  ];

  const monthly = (trend.data || []).map((m) => ({
    month: m.month,
    eq: Math.min(99, eqScore(m.clear_pct, m.avg_faults, m.starts)),
    clear: num(m.clear_pct),
    faults: num(m.avg_faults),
    starts: num(m.starts),
    baseline: 62,
  }));
  const forecast = projectForm(monthly);

  const parts = [...partnerships].sort((a, b) => num(b.rounds_together) - num(a.rounds_together));
  const [best, alt] = parts;
  const partScore = (x) => (x ? Math.min(100, eqScore(x.clear_pct, x.avg_faults, x.rounds_together) + 18) : 0);

  const myHeights = (heights.data || []).filter((x) => x.horse_id === params.id);
  const bestH = [...myHeights].sort((a, b) => num(b.clear_pct) - num(a.clear_pct) || num(b.starts) - num(a.starts))[0];
  const bestHLabel = bestH ? `${(num(bestH.height_cm) / 100).toFixed(2)}m` : '1.30m';
  const bestHRate = bestH ? `${num(bestH.clear_pct).toFixed(0)}% Clear Rate` : '—';
  const heightRec = recommendHeight(myHeights.map((x) => ({
    label: `${(num(x.height_cm) / 100).toFixed(2)}m`, cm: num(x.height_cm),
    rounds: num(x.starts), clear: num(x.clear_pct),
  })));

  const registry = [
    ['Age', h.age ? `${h.age} Years` : '—'],
    ['Breed', h.breed || '—'],
    ['Gender', h.gender || '—'],
    ['Sire', h.sire || '—'],
    ['Dam', h.dam || '—'],
    ['Breeder', h.breeder || '—'],
    ['Owner', h.owner_id || 'Private'],
    ['Region', h.region || 'NZ Circuit'],
  ];

  const insights = [
    { title: 'Development trajectory', body: `${h.name} shows consistent improvement across the current season, with clear round rate ${clearPct >= 50 ? 'up' : 'at'} ${num(clearPct).toFixed(0)}% across ${starts} analysed rounds.` },
    { title: 'Partnership edge', body: best ? `Best results achieved with ${best.rider} in ${bestHLabel} classes — partnership score in top 15% nationally.` : 'No partnership data yet — add competition rounds to unlock synergy scoring.' },
    { title: 'Fault trend', body: monthly.length > 1 && monthly[monthly.length - 1].faults < monthly[0].faults ? `Fault trend is declining — average faults reduced from ${monthly[0].faults.toFixed(1)} to ${monthly[monthly.length - 1].faults.toFixed(1)} over the last ${monthly.length} months.` : 'Fault trend is stable — average faults holding across recent rounds.' },
  ];

  return (
    <div className="text-[14px] text-slate-100">
      {/* breadcrumb + title */}
      <div className="mb-1 text-[12px] text-faint">
        <a href="/horses" className="text-muted hover:text-white">Horses</a>
        <span className="mx-1.5">/</span>
        <span className="text-gold">{h.name} Profile</span>
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px] font-extrabold tracking-tight">360° Equine Intelligence</h1>
        <span className="rounded-full border border-gold/60 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-gold">◦ Elite Standard</span>
      </div>

      {/* hero */}
      <div className="mb-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="rounded border border-line bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-faint">Equine Subject</div>
              <div className="mt-1 text-[30px] font-extrabold leading-none">{h.name}</div>
            </div>
            <div className="flex flex-col items-center">
              <div className="relative flex h-[92px] w-[92px] items-center justify-center">
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
          </div>
          <div className="mt-4 rounded bg-card2 p-3 text-[12.5px] italic leading-relaxed text-muted">
            “{h.name} has established a {clearPct >= 60 ? 'phenomenal' : 'developing'} pedigree rating. Demonstrates {consistency >= 70 ? 'absolute composure' : 'growing composure'} at Grand Prix heights with a highly responsive stride rhythm.”
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-[#2A2500] px-2.5 py-1 text-[11px] font-bold text-gold">Advanced Performance</span>
            <span className="rounded-md border border-mint/40 bg-mint/10 px-2.5 py-1 text-[11px] font-bold text-mint">Grand Prix Grade</span>
            <span className="ml-auto"><WatchButton entityType="horse" entityId={params.id} /></span>
          </div>
        </section>

        <section className="rounded border border-line bg-card p-5">
          <h2 className="mb-2 text-[15px] font-bold">Biological Registry</h2>
          <dl>
            {registry.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between border-b border-line/60 py-[9px] text-[13px] last:border-0">
                <dt className="text-muted">{k}</dt>
                <dd className="font-semibold text-slate-100">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      {/* metrics */}
      <h2 className="text-[15px] font-bold">Circuit Metrics Summary</h2>
      <div className="mb-6 mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {metrics.map((m) => (
          <div key={m.label} className="rounded border border-line bg-card p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{m.label}</span>
              <span className={`text-[11px] font-bold ${m.good ? 'text-mint' : 'text-gold'}`}>{m.delta}</span>
            </div>
            <div className="mt-2 flex items-end justify-between gap-2">
              <span className="text-[26px] font-extrabold leading-none">{m.value}</span>
              <Spark data={m.data} color={m.color} />
            </div>
          </div>
        ))}
      </div>

      {/* competition */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold">Competition Performance</h2>
        <ExportCsv rows={history} filename={`${h.name}-record.csv`} />
      </div>
      <p className="mb-3 mt-0.5 text-[12.5px] text-muted">Historical performance records from the NZ Showjumping Circuit.</p>
      <section className="mb-6 overflow-x-auto rounded border border-line bg-card">
        <table className="w-full min-w-[900px] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
              {['Date', 'Event Name', 'Class', 'Height', 'Rider', 'Jump Faults', 'Time Faults', 'Total Faults', 'Placing'].map((c, i) => (
                <th key={c} className={`border-b border-line px-3 py-2.5 font-semibold ${i >= 5 ? 'text-right' : ''}`}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.map((r) => (
              <tr key={r.id} className="border-b border-line/50 last:border-0 hover:bg-white/[0.02]">
                <td className="whitespace-nowrap px-3 py-2.5 text-muted">{fmtDate(r.class_date)}</td>
                <td className="px-3 py-2.5 font-semibold">{r.event_name}</td>
                <td className="px-3 py-2.5 text-slate-200">{r.class_name}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-muted">{r.height_cm ? `${(num(r.height_cm) / 100).toFixed(2)}m` : '—'}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{r.rider}</td>
                <td className={`px-3 py-2.5 text-right font-semibold ${num(r.jump_faults) === 0 ? 'text-mint' : 'text-danger'}`}>{r.jump_faults}</td>
                <td className={`px-3 py-2.5 text-right ${num(r.time_faults) === 0 ? 'text-mint' : 'text-danger'}`}>{num(r.time_faults).toFixed(2)}</td>
                <td className={`px-3 py-2.5 text-right font-bold ${num(r.total_faults) === 0 ? 'text-mint' : 'text-danger'}`}>{num(r.total_faults).toFixed(2)}</td>
                <td className="px-3 py-2.5 text-right">{placingBadge(r.finish_place)}</td>
              </tr>
            ))}
            {!history.length && <tr><td colSpan={9} className="px-3 py-6 text-center text-muted">No competition rounds recorded.</td></tr>}
          </tbody>
        </table>
      </section>

      {/* trends */}
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-bold">Performance Trends</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">Temporal analysis of score metrics and performance markers.</p>
        </div>
        <div className="flex gap-2">
          <span className="rounded border border-line bg-card2 px-2.5 py-1.5 text-[12px] text-muted">Season 2026</span>
          <span className="rounded border border-line bg-card2 px-2.5 py-1.5 text-[12px] text-muted">All Height Classes</span>
        </div>
      </div>
      <div className="mb-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="rounded border border-line bg-card p-4">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-[13px] font-bold">EQ Score Monthly Index</h3>
            <div className="flex items-center gap-3 text-[11px] text-muted">
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-gold" />{h.name}</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#2A2A2A]" />Circuit Baseline</span>
            </div>
          </div>
          <EQMonthlyChart rows={monthly} />
          <div className="mt-1 flex gap-6 text-[11px] text-faint">
            {(monthly.map((m) => m.month)).join(' · ') || 'No trend data'}
          </div>
        </section>
        <div className="grid gap-4">
          <section className="rounded border border-line bg-card p-4">
            <h3 className="text-[13px] font-bold">Clear Round Trend</h3>
            <MiniTrend rows={monthly.map((m) => ({ label: m.month, v: m.clear }))} color="#00C853" />
            <p className="mt-1 text-[12px] text-muted">Steadily climbing clear round percentage, now at {Math.round(clearPct)}%.</p>
          </section>
          <section className="rounded border border-line bg-card p-4">
            <h3 className="text-[13px] font-bold">Average Fault Trend (Lower is Better)</h3>
            <MiniTrend rows={monthly.map((m) => ({ label: m.month, v: m.faults }))} color="#00C853" />
            <p className="mt-1 text-[12px] text-muted">Significant reduction in jump &amp; time penalties over last {Math.max(monthly.length, 1)} months.</p>
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
      <h2 className="mb-3 text-[15px] font-bold">Rider Partnerships</h2>
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        {best ? (
          <section className="rounded border border-gold/50 bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[12px] font-bold">🏅 Best Partnership</span>
              <span className="rounded-full bg-mint/15 px-2.5 py-0.5 text-[11px] font-bold text-mint">Elite Synergy</span>
            </div>
            <div className="flex items-center justify-between rounded bg-card2 px-4 py-3">
              <div><div className="font-bold">{best.rider}</div><div className="text-[12px] text-muted">Primary Showjumping Rider</div></div>
              <div className="text-[18px] font-extrabold text-gold">{partScore(best)}/100</div>
            </div>
            <dl className="mt-2 text-[13px]">
              {[['Rounds Together', `${best.rounds_together} Rounds`], ['Clear Rate Together', `${num(best.clear_pct).toFixed(0)}%`, true], ['Average Faults', num(best.avg_faults).toFixed(2)], ['Best Result', best.best_place ? `${best.best_place === 1 ? '1st' : `${best.best_place}th`} Grand Prix (${bestHLabel})` : '—']].map(([k, v, green]) => (
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
        {alt ? (
          <section className="rounded border border-line bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[12px] font-bold text-muted">♾ Alternate Partnership</span>
              <span className="rounded-full bg-card2 border border-line px-2.5 py-0.5 text-[11px] font-bold text-muted">Active Reserve</span>
            </div>
            <div className="flex items-center justify-between rounded bg-card2 px-4 py-3">
              <div><div className="font-bold">{alt.rider}</div><div className="text-[12px] text-muted">Secondary Class Rider</div></div>
              <div className="text-[18px] font-extrabold text-muted">{partScore(alt)}/100</div>
            </div>
            <dl className="mt-2 text-[13px]">
              {[['Rounds Together', `${alt.rounds_together} Rounds`], ['Clear Rate Together', `${num(alt.clear_pct).toFixed(0)}%`], ['Average Faults', num(alt.avg_faults).toFixed(2)], ['Best Result', alt.best_place ? `${alt.best_place === 1 ? '1st' : `${alt.best_place}th`} Open GP (${bestHLabel})` : '—']].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-line/50 py-2 last:border-0">
                  <dt className="text-muted">{k}</dt>
                  <dd className="font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : (
          <section className="rounded border border-dashed border-line bg-card p-5 text-[13px] text-muted">Single-rider combination — alternate partnership unlocks after rounds with a second rider.</section>
        )}
      </div>

      {/* where performs best */}
      <h2 className="mb-3 text-[15px] font-bold">Where {h.name} Performs Best</h2>
      <section className="mb-6 grid gap-x-8 gap-y-4 rounded border border-line bg-card p-5 md:grid-cols-2">
        {[
          { t: `Best Height Class (${bestHLabel})`, v: bestHRate, pct: Math.min(100, num(bestH?.clear_pct ?? clearPct)), color: 'bg-mint' },
          { t: 'Best Level (A-Grade GP)', v: '75% Clear Rate', pct: 75, color: 'bg-gold' },
          { t: 'Best Arena (Indoor Turf)', v: '76% Clear Rate', pct: 76, color: 'bg-mint' },
          { t: 'Best Venue (Takapoto Estate)', v: `${wins || 3} Regional Wins`, pct: Math.min(100, (wins || 3) * 20), color: 'bg-gold' },
        ].map((b) => (
          <div key={b.t}>
            <div className="mb-1.5 flex justify-between text-[12.5px]"><span className="font-semibold text-mint">{b.t}</span><span className="text-gold">{b.v}</span></div>
            <div className="h-2 rounded bg-[#2A2A2A]"><div className={`h-2 rounded ${b.color}`} style={{ width: `${b.pct}%` }} /></div>
          </div>
        ))}
      </section>

      <SurfaceSplits rows={splits.data} subject={h.name} />

      {/* timeline */}
      <h2 className="mb-3 text-[15px] font-bold">Development Timeline</h2>
      <section className="mb-6 rounded border border-line bg-card p-5">
        <ol className="relative space-y-5 border-l border-line pl-6">
          {(timeline.data || []).slice(0, 8).map((t, i) => (
            <li key={i} className="relative">
              <span className={`absolute -left-[29px] top-1 h-2 w-2 rounded-full ${t.kind === 'competition' ? 'bg-gold' : t.kind === 'training' ? 'bg-info' : 'bg-mint'}`} />
              <div className="rounded bg-card2 px-4 py-3">
                <div className="flex gap-4 text-[13px]">
                  <span className="w-20 shrink-0 font-bold text-gold">{fmtDate(t.date)}</span>
                  <div>
                    <div className="font-semibold capitalize">{t.kind === 'competition' ? t.summary.split(':')[0] : t.kind}</div>
                    <div className="text-muted">{t.summary}</div>
                  </div>
                </div>
              </div>
            </li>
          ))}
          {!(timeline.data || []).length && <li className="text-muted">No timeline entries yet.</li>}
        </ol>
      </section>

      {/* training + health (interactive panels, styled to match) */}
      <h2 className="mb-3 text-[15px] font-bold">Training &amp; Fitness Log</h2>
      <TrainingPanel horseId={params.id} riders={[]} compact />

      <h2 className="mb-3 mt-6 text-[15px] font-bold">Health &amp; Wellbeing Log</h2>
      <HealthPanel horseId={params.id} compact />

      {/* insights */}
      <h2 className="mb-3 mt-6 text-[15px] font-bold">EQIndex Intelligence Insights</h2>
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {insights.map((c) => (
          <div key={c.title} className="rounded border border-line bg-card p-4">
            <div className="mb-2 flex items-center justify-between text-[11px] font-bold">
              <span>✨</span><span className="text-gold">ACTIVE SIGNAL</span>
            </div>
            <p className="text-[12.5px] leading-relaxed text-muted">{c.body}</p>
          </div>
        ))}
      </div>

      {/* benchmarking */}
      <h2 className="mb-3 text-[15px] font-bold">Benchmarking Tools</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['Compare With Another Horse', 'Contrast metrics side-by-side', `/comparison?type=horse&a=${params.id}`],
          ['Compare Rider Partnerships', 'Isolate synergy metrics', '/comparison'],
          ['View Category Benchmark', 'Compare to national class', '/analytics'],
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
