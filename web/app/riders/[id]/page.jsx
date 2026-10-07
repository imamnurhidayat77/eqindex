import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJSON } from '../../../lib/api';
import { projectForm, recommendHeight, suggestPartners } from '../../../lib/forecast';
import { statusBadge } from '../../../lib/tokens';
import WatchButton from '../../../components/WatchButton';
import { RiderSeasonChart, RiderMiniTrend } from '../../../components/rider-profile-charts';
import SurfaceSplits from '../../../components/SurfaceSplits';
import ExportCsv from '../../../components/ExportCsv';
import HistoryTable from '../../../components/HistoryTable';
import { EmptyState, TableEmpty } from '../../../components/EmptyState';
import { StatCard, StatGrid } from '../../../components/StatCard';

export const revalidate = 30;

const fmtDate = (d) => (d || '').slice(0, 10);
const num = (v, d = 0) => (v === null || v === undefined || v === '' ? d : Number(v));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const initials = (name) => String(name || '').trim().split(/\s+/)
  .slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('') || '–';

// Real medal: ribbon straps + medallion, tinted by division colour.
// Elite gets a gold outer ring + glow. No text — division comes from tooltip.
const shade = (hex, amt) => {
  const n = String(hex || '#888888').replace('#', '');
  const full = n.length === 3 ? n.split('').map((c) => c + c).join('') : n;
  const digits = parseInt(full, 16) || 0x888888;
  const cl = (v) => Math.max(0, Math.min(255, v));
  const rr = cl((digits >> 16) + amt), gg = cl(((digits >> 8) & 255) + amt), bb = cl((digits & 255) + amt);
  return `#${((rr << 16) | (gg << 8) | bb).toString(16).padStart(6, '0')}`;
};
const MedalIcon = ({ color, elite, label, detail }) => {
  const c = color || '#888888';
  return (
    <span className="group relative inline-block leading-none cursor-default">
      <svg width="24" height="32" viewBox="0 0 24 32" aria-hidden="true">
        <polygon points="7,0 11.5,0 10,12 5.5,12" fill={shade(c, -45)} />
        <polygon points="13,0 17.5,0 19,12 14.5,12" fill={shade(c, -45)} />
        <polygon points="11.5,0 13,0 12.6,12 11.9,12" fill={shade(c, -70)} />
        <circle cx="12" cy="13.5" r="2" fill="none" stroke={elite ? '#FFD700' : shade(c, -40)} strokeWidth="1.6" />
        {elite && <circle cx="12" cy="23.5" r="8.6" fill="none" stroke="#FFD700" strokeWidth="1.6" />}
        <circle cx="12" cy="23.5" r="7.5" fill={c} />
        <circle cx="12" cy="23.5" r="5" fill={shade(c, 35)} opacity="0.55" />
        <circle cx="10" cy="21.5" r="1.6" fill="#ffffff" opacity="0.5" />
      </svg>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-card2 px-2.5 py-1.5 text-center opacity-0 transition-opacity duration-100 group-hover:opacity-100">
        <span className="block text-[12px] font-bold text-white">{elite ? `Elite ${label} Medal` : `${label} Medal`}</span>
        <span className="block text-[10px] text-muted">{detail}</span>
      </span>
    </span>
  );
};

// Fallback divisions when no active scoring version is published.
const DEFAULT_DIVS = [
  { key: 'development', label: 'Development', min: null, max: 100, color: '#A0A0A0' },
  { key: 'copper', label: 'Copper', min: 100, max: 120, color: '#B87333' },
  { key: 'bronze', label: 'Bronze', min: 120, max: 130, color: '#CD7F32' },
  { key: 'silver', label: 'Silver', min: 130, max: 145, color: '#C0C0C0' },
  { key: 'gold', label: 'Gold', min: 145, max: null, color: '#FFD700' },
  // World Cup is class-based, never height-matched — keep last.
  { key: 'world_cup', label: 'World Cup', min: null, max: null, color: '#8E7CFF' },
];
const divisionFor = (heightCm, divs) => {
  if (heightCm === null || heightCm === undefined || heightCm === '' || Number.isNaN(Number(heightCm))) return null;
  const hgt = Number(heightCm);
  return (divs || []).find((d) =>
    (d.min === null || d.min === undefined || hgt >= d.min) &&
    (d.max === null || d.max === undefined || hgt < d.max)) || null;
};

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

export default async function RiderProfile({ params, searchParams }) {
  const [p, allRiders, events, allHorses, heightStats, splits, ptBoard, mbBoard, fg, scoring] = await Promise.all([
    getJSON(`/riders/${params.id}`).catch(() => null),
    getJSON('/rankings/riders?limit=100').catch(() => ({ data: [] })),
    getJSON('/events?limit=100&has_data=1').catch(() => ({ data: [] })),
    getJSON('/rankings/horses?limit=100').catch(() => ({ data: [] })),
    getJSON('/height-stats?limit=200').catch(() => ({ data: [] })),
    getJSON(`/riders/${params.id}/splits`).catch(() => ({ data: [] })),
    getJSON('/rankings/riders?limit=200&metric=points').catch(() => ({ data: [] })),
    getJSON('/rankings/modelb/riders?limit=500').catch(() => ({ data: [] })),
    getJSON(`/formguide/rider/${params.id}`).catch(() => null),
    getJSON('/scoring/active').catch(() => null),
  ]);
  const divisions = scoring?.data?.params?.divisions?.length ? scoring.data.params.divisions : DEFAULT_DIVS;
  if (!p?.data) notFound();
  const { data: r, stats: s, history = [], partnerships = [] } = p;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(params.id) && r.slug && r.slug !== params.id) {
    const { redirect } = await import('next/navigation');
    redirect(`/riders/${r.slug}`);
  }
  const regional = await getJSON(`/rankings/riders?limit=100&region=${encodeURIComponent(r.region || '')}`).catch(() => ({ data: [] }));

  const starts = num(s?.starts ?? history.length);
  const clearPct = num(s?.clear_pct ?? 0);
  const avgFaults = num(s?.avg_faults ?? 0);
  const wins = num(s?.wins ?? history.filter((x) => Number(x.finish_place) === 1).length);
  const top10 = history.filter((x) => Number(x.finish_place) >= 1 && Number(x.finish_place) <= 10).length;
  const horsesRidden = num(s?.horses_ridden ?? new Set(history.map((x) => x.horse_id || x.horse)).size);
  const eventsEntered = new Set(history.map((x) => x.event_id || x.event_name)).size;
  const ptRow = (ptBoard.data || []).find((x) => x.rider_id === r.id || x.rider_id === params.id);
  const riderPoints = ptRow ? Number(ptRow.total_points) : null;
  const mbRow = (mbBoard.data || []).find((x) => x.rider_id === r.id || x.rider_id === params.id);
  const riderRating = mbRow ? Number(mbRow.best12) : null;
  // Rank only counts once the 20-round form window is full — never fall back
  // to the ungated best-12 order.
  const formRank = fg?.data?.rank ?? null;
  const formEligible = fg?.data?.eligible ?? null;
  const formMin = fg?.data?.window?.min_n ?? 20;
  const formRounds = mbRow ? Number(mbRow.rounds) || 0 : 0;
  const roundsNeeded = fg?.data && !formEligible && riderRating !== null ? Math.max(0, formMin - formRounds) : 0;

  // ---- ranks (by clear rate) ----
  const ranked = (allRiders.data || [])
    .map((x) => ({ ...x }))
    .sort((a, b) => Number(b.clear_pct) - Number(a.clear_pct));
  const natRank = ranked.findIndex((x) => x.rider_id === params.id) + 1 || '—';
  const rankedRegional = (regional.data || [])
    .map((x) => ({ ...x }))
    .sort((a, b) => Number(b.clear_pct) - Number(a.clear_pct));
  const regionRank = rankedRegional.findIndex((x) => x.rider_id === params.id) + 1 || '—';
  const hiHeights = [...history].filter((x) => num(x.height_cm) >= 130);
  // NZ season runs Aug–Jul; derive "2026/27"-style labels from actual rounds.
  const seasonOf = (ds) => {
    if (!ds) return null;
    const d = new Date(ds);
    if (Number.isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    return d.getMonth() + 1 >= 8 ? `${y}/${String(y + 1).slice(2)}` : `${y - 1}/${String(y).slice(2)}`;
  };
  const seasonsHit = [...new Set(history.map((x) => seasonOf(x.class_date)).filter(Boolean))].sort();
  const lastSeason = seasonsHit.length ? seasonsHit[seasonsHit.length - 1] : null;
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
      return { label: m.label, clear, faults: avg, starts: m.rounds };
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
      return { ...m, clear, faults: avg };
    });

  // ---- sparklines ----
  const chrono = [...history].reverse();
  const sparkClear = chrono.map((_, i, arr) => {
    const slice = arr.slice(0, i + 1).slice(-5);
    return (100 * slice.filter((x) => x.clear_round).length) / Math.max(slice.length, 1);
  });
  const sparkFaults = chrono.map((x) => num(x.total_faults));
  const markers = [
    { label: 'Total Rounds', value: String(starts), data: chrono.map((_, i) => i + 1), color: '#FFD700' },
    { label: 'Events Entered', value: String(eventsEntered), data: chrono.map((_, i) => i + 1), color: '#FFD700' },
    { label: 'Horses Ridden', value: String(horsesRidden), data: chrono.map((_, i) => new Set(chrono.slice(0, i + 1).map((x) => x.horse_id)).size), color: '#FFD700' },
    { label: 'Clear Rate', value: `${Math.round(clearPct)}%`, data: sparkClear, color: '#00C853' },
    { label: 'Avg Faults', value: avgFaults.toFixed(2), data: sparkFaults, color: '#00C853' },
    { label: 'Wins', value: String(wins), data: chrono.map((_, i) => chrono.slice(0, i + 1).filter((x) => Number(x.finish_place) === 1).length), color: '#FFD700' },
    { label: 'Top 10 Finishes', value: String(top10), data: chrono.map((_, i) => chrono.slice(0, i + 1).filter((x) => Number(x.finish_place) <= 10 && Number(x.finish_place) >= 1).length), color: '#FFD700' },
    { label: 'Points', value: riderPoints === null ? '–' : String(riderPoints), data: chrono.map((_, i) => i + 1), color: '#FFD700' },
  ];

  // ---- partnerships ----
  const parts = [...partnerships].sort((a, b) => num(b.rounds_together) - num(a.rounds_together));
  const best = parts[0];

  // ---- divisions (same engine as horse profile) ----
  const divFilter = (searchParams && searchParams.div) || '';
  // World Cup flag wins over height bands (Charles sheet WC column).
  const divOf = (x) => (x.is_world_cup ? 'world_cup' : divisionFor(x.height_cm, divisions)?.key || '');
  const divSummary = divisions
    .map((d) => {
      const rs = history.filter((x) => divOf(x) === d.key);
      const clears = rs.filter((x) => x.clear_round).length;
      const faults = rs.reduce((t, x) => t + num(x.total_faults), 0);
      return { ...d, rounds: rs.length, clears, faults, pct: rs.length ? (100 * clears) / rs.length : 0 };
    })
    .filter((d) => d.rounds > 0);
  const earnedBadges = divSummary
    .map((d) => ({ ...d, elite: d.clears >= 10 && d.faults <= 12 }))
    .filter((d) => d.clears >= 3 || d.elite);
  const divTotals = divSummary.reduce(
    (t, d) => ({ rounds: t.rounds + d.rounds, clears: t.clears + d.clears }),
    { rounds: 0, clears: 0 });
  const divsPresent = divisions.filter((d) => history.some((x) => divOf(x) === d.key));
  const roundHistory = divFilter ? history.filter((x) => divOf(x) === divFilter) : history;
  const divHref = (key) => {
    const p = new URLSearchParams();
    if (key) p.set('div', key);
    const s = p.toString();
    return `/riders/${params.id}${s ? `?${s}` : ''}`;
  };

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
      clear: Number(x.clear_pct),
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
        <Link href="/riders" className="text-muted hover:text-white">Riders</Link>
        <span className="mx-1.5">/</span>
        <span className="text-gold">{r.name} Profile</span>
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px] font-extrabold tracking-tight">Rider Performance Intelligence</h1>
      </div>

      {/* hero */}
      <div className="mb-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="rounded border border-line bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.12em] text-faint">Showjumping Athlete</div>
              <div className="mt-1 text-[30px] font-extrabold leading-none break-words">{r.name}</div>
              {!!earnedBadges.length && (
                <div className="mt-2.5 flex flex-wrap gap-2" role="img" aria-label={`Division medals: ${earnedBadges.map((d) => d.label).join(', ')}`}>
                  {earnedBadges.map((d) => (
                    <MedalIcon key={d.key} color={d.color} elite={d.elite} label={d.label}
                      detail={d.elite
                        ? `${d.clears} clears · ${d.faults.toFixed(0)} faults`
                        : `${d.clears} clears`} />
                  ))}
                </div>
              )}
              <div className="mt-2"><WatchButton entityType="rider" entityId={params.id} /></div>
            </div>
            <div className="text-center">
              <div className="text-[26px] font-extrabold leading-none tabular-nums text-gold">{riderRating === null || !formEligible ? '–' : riderRating.toFixed(1)}</div>
              <div className="mt-0.5 text-[9px] uppercase tracking-wide text-muted">Rating{formRank ? ` · #${formRank}` : ''}</div>
              {!!roundsNeeded && (
                <div className="mt-1 text-[10px] text-faint">{roundsNeeded} more round{roundsNeeded === 1 ? '' : 's'} to rank</div>
              )}
            </div>
            <div className="text-center">
              <div className="text-[26px] font-extrabold leading-none tabular-nums">{riderPoints === null ? '–' : riderPoints}</div>
              <div className="mt-0.5 text-[9px] uppercase tracking-wide text-muted">Points</div>
            </div>
          </div>
        </section>

        <section className="rounded border border-line bg-card p-5">
          <h2 className="mb-2 text-[15px] font-bold">Rider Registry Info</h2>
          <dl>
            {[
              ['Region', r.region || '—'],
              ['Season Status', lastSeason ? `${lastSeason} Active` : '—'],
              ['Horses Ridden', String(horsesRidden)],
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
      <StatGrid cols={4} className="mt-3">
        {markers.map((m) => (
          <StatCard
            key={m.label}
            label={m.label}
            value={m.value}
            spark={m.data}
            sparkColor={m.color}
          />
        ))}
      </StatGrid>

      {/* competition history */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold">Competition History</h2>
        <ExportCsv rows={history} filename={`${r.name}-record.csv`} />
      </div>
      <p className="mb-3 mt-0.5 text-[12.5px] text-muted">Rider performance logs from official New Zealand showjumping rounds.</p>
      <section className="mb-6 rounded border border-line bg-card p-4">
        <HistoryTable rows={history} mode="rider" />
      </section>

      {/* form guide — last-N rounds across all horses, drop-D worst */}
      {fg?.data && (
        <>
          <h2 className="text-[15px] font-bold">Form Guide</h2>
          <p className="mb-3 mt-0.5 text-[12.5px] text-muted">
            {fg.data.eligible
              ? `Ranked #${fg.data.rank} on ${fg.data.kept} counting rounds (best ${fg.data.window.last_n} minus ${fg.data.window.drop_n} drops, all horses).`
              : `Building form — needs ${fg.data.window.min_n} rounds to rank (has ${fg.data.rounds}).`}
          </p>
          <section className="mb-6 rounded border border-line bg-card p-4">
            <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="border-b border-line px-3 py-2.5 font-semibold">Date</th>
                <th className="border-b border-line px-3 py-2.5 font-semibold">Horse</th>
                <th className="border-b border-line px-3 py-2.5 font-semibold">Event</th>
                <th className="border-b border-line px-3 py-2.5 font-semibold text-right">Ht</th>
                <th className="border-b border-line px-3 py-2.5 font-semibold text-right">Pl</th>
                <th className="border-b border-line px-3 py-2.5 font-semibold text-right">Score</th>
              </tr></thead>
              <tbody>
                {(fg.data.rounds_detail || []).map((r) => (
                  <tr key={r.round_id} className={`border-b border-line/50 last:border-0 ${r.dropped ? 'opacity-45' : ''}`}>
                    <td className="px-3 py-2 text-muted">{fmtDate(r.class_date)}</td>
                    <td className="px-3 py-2">{r.horse}</td>
                    <td className="px-3 py-2">{r.event_name}</td>
                    <td className="px-3 py-2 text-right text-muted">{r.height_cm ? `${(Number(r.height_cm) / 100).toFixed(2)}m` : '—'}</td>
                    <td className="px-3 py-2 text-right">{r.finish_place ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">{r.dropped ? <s>{Number(r.modelb).toFixed(1)}</s> : Number(r.modelb).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </section>
        </>
      )}

      {/* division summary — rounds, clears and clear rate per division */}
      {!!divSummary.length && (
        <>
          <h2 className="text-[15px] font-bold">Division Summary</h2>
          <p className="mb-3 mt-0.5 text-[12.5px] text-muted">Rounds and clears per division across the full record.</p>
          <section className="mb-6 rounded border border-line bg-card p-4">
            <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="border-b border-line px-3 py-2.5 font-semibold"></th>
                {divSummary.map((d) => (
                  <th key={d.key} className="border-b border-line px-3 py-2.5 font-semibold text-right">
                    <span className="inline-flex items-center gap-1.5 justify-end">
                      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: d.color || '#888' }} />
                      {d.label}
                    </span>
                  </th>
                ))}
                <th className="border-b border-line px-3 py-2.5 font-semibold text-right">Total</th>
              </tr></thead>
              <tbody>
                <tr className="border-b border-line/50 hover:bg-white/[0.02]">
                  <td className="px-3 py-2.5 text-muted">Rounds</td>
                  {divSummary.map((d) => (
                    <td key={d.key} className="px-3 py-2.5 text-right text-muted">{d.rounds}</td>
                  ))}
                  <td className="px-3 py-2.5 text-right"><b>{divTotals.rounds}</b></td>
                </tr>
                <tr className="border-b border-line/50 hover:bg-white/[0.02]">
                  <td className="px-3 py-2.5 text-muted">Clear</td>
                  {divSummary.map((d) => (
                    <td key={d.key} className="px-3 py-2.5 text-right text-muted">{d.clears}</td>
                  ))}
                  <td className="px-3 py-2.5 text-right"><b>{divTotals.clears}</b></td>
                </tr>
                <tr className="hover:bg-white/[0.02]">
                  <td className="px-3 py-2.5 text-muted">Clear %</td>
                  {divSummary.map((d) => (
                    <td key={d.key} className="px-3 py-2.5 text-right font-bold text-moss">{d.pct.toFixed(1)}%</td>
                  ))}
                  <td className="px-3 py-2.5 text-right font-bold text-gold">
                    {divTotals.rounds ? `${((100 * divTotals.clears) / divTotals.rounds).toFixed(1)}%` : '–'}
                  </td>
                </tr>
              </tbody>
            </table>
            </div>
          </section>
        </>
      )}

      {/* round record — simple per-round log: division, place, clear star, horse */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold">Round Record</h2>
        {divsPresent.length > 1 && (
          <span className="flex items-center gap-1.5">
            {[['', 'All'], ...divsPresent.map((d) => [d.key, d.label])].map(([v, l]) => (
              <Link key={v || 'all'} href={divHref(v)}
                className={`text-[11px] rounded-full px-2 py-0.5 border no-underline ${divFilter === v ? 'bg-goldbg border-gold text-gold font-bold' : 'border-line text-muted'}`}>{l}</Link>
            ))}
          </span>
        )}
      </div>
      <p className="mb-3 mt-0.5 text-[12.5px] text-muted">Every round entered — division by height, placing, clear star and horse.</p>
      <section className="mb-6 rounded border border-line bg-card p-4">
        <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted">
            <th className="border-b border-line px-3 py-2.5 font-semibold">Division</th>
            <th className="border-b border-line px-3 py-2.5 font-semibold text-right">Place</th>
            <th className="border-b border-line px-3 py-2.5 font-semibold text-center">Clear</th>
            <th className="border-b border-line px-3 py-2.5 font-semibold">Horse</th>
          </tr></thead>
          <tbody>
            {roundHistory.map((x) => {
              const div = divisions.find((d) => d.key === divOf(x)) || null;
              return (
                <tr key={x.id} className="border-b border-line/50 last:border-0 hover:bg-white/[0.02]">
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {div ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: div.color || '#888' }} />
                        <b>{div.label}</b>
                        <span className="text-[11px] text-faint">{x.height_cm ? `${(num(x.height_cm) / 100).toFixed(2)}m` : ''}</span>
                      </span>
                    ) : <span className="text-faint">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold">{x.finish_place ?? '–'}</td>
                  <td className="px-3 py-2.5 text-center text-[16px] leading-none">
                    {x.clear_round
                      ? <span className="text-gold" title="Clear round">★</span>
                      : <span className="text-faint" title="Not clear">☆</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <Link href={`/horses/${x.horse_slug || x.horse_id}`} title={x.horse}
                      className="inline-flex items-center justify-center min-w-9 h-7 px-1.5 rounded-full border border-line bg-card2 text-[12px] font-bold text-white no-underline hover:border-gold/60 hover:text-gold">
                      {initials(x.horse)}
                    </Link>
                  </td>
                </tr>
              );
            })}
            {!roundHistory.length && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-muted text-[13px]">No rounds recorded yet.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </section>
    </div>
  );
}
