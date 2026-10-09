import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJSON } from '../../../lib/api';
import { statusBadge } from '../../../lib/tokens';
import WatchButton from '../../../components/WatchButton';
import SurfaceSplits from '../../../components/SurfaceSplits';
import ExportCsv from '../../../components/ExportCsv';
import HistoryTable from '../../../components/HistoryTable';
import SeasonTimeline from '../../../components/SeasonTimeline';
import { StatCard, StatGrid } from '../../../components/StatCard';

export const revalidate = 30;

const num = (v, d = 0) => (v === null || v === undefined || v === '' ? d : Number(v));

// Real medal: ribbon straps + medallion, tinted by division colour.
// Elite gets a gold outer ring + glow. No text — division comes from tooltip.
const shade = (hex, amt) => {
  const n = String(hex || '#888888').replace('#', '');
  const full = n.length === 3 ? n.split('').map((c) => c + c).join('') : n;
  const num = parseInt(full, 16) || 0x888888;
  const cl = (v) => Math.max(0, Math.min(255, v));
  const r = cl((num >> 16) + amt), g = cl(((num >> 8) & 255) + amt), b = cl((num & 255) + amt);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
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

// v0.3 fallback divisions when no active scoring version is published.
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

export default async function HorseProfile({ params, searchParams }) {
  const hBand = (searchParams && searchParams.h) || '';
  const [p, splits, mbBoard, fg, scoring] = await Promise.all([
    getJSON(`/horses/${params.id}`).catch(() => null),
    getJSON(`/horses/${params.id}/splits`).catch(() => ({ data: [] })),
    getJSON('/rankings/modelb/horses?limit=500').catch(() => ({ data: [] })),
    getJSON(`/formguide/horse/${params.id}`).catch(() => null),
    getJSON('/scoring/active').catch(() => null),
  ]);
  const divisions = scoring?.data?.params?.divisions?.length ? scoring.data.params.divisions : DEFAULT_DIVS;
  if (!p?.data) notFound();
  const { data: h, stats: s, history = [] } = p;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(params.id) && h.slug && h.slug !== params.id) {
    const { redirect } = await import('next/navigation');
    redirect(`/horses/${h.slug}`);
  }

  const starts = num(s?.starts ?? history.length);
  const clearPct = num(s?.clear_pct ?? 0);
  const avgFaults = num(s?.avg_faults ?? 0);
  const wins = num(s?.wins ?? history.filter((r) => Number(r.finish_place) === 1).length);
  const top10 = history.filter((r) => Number(r.finish_place) >= 1 && Number(r.finish_place) <= 10).length;
  const eventsEntered = new Set(history.map((r) => r.event_id || r.event_name)).size;
  const mbRow = (mbBoard.data || []).find((x) => x.horse_id === h.id || x.horse_id === params.id);
  const horseRating = mbRow ? Number(mbRow.best12) : null;
  // Rank only counts once the 10-round form window is full — never fall back
  // to the ungated best-12 order.
  const formRank = fg?.data?.rank ?? null;
  const formEligible = fg?.data?.eligible ?? null;
  const formMin = fg?.data?.window?.min_n ?? 10;
  const formRounds = mbRow ? Number(mbRow.rounds) || 0 : 0;
  const roundsNeeded = fg?.data && !formEligible && horseRating !== null ? Math.max(0, formMin - formRounds) : 0;

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
  ];

  const bandHistory = history.filter((r) => {
    if (!hBand) return true;
    const cm = num(r.height_cm, 0);
    if (!cm) return false;
    const [lo, hi] = hBand.split('-');
    return cm >= Number(lo) && (!hi || cm <= Number(hi));
  });
  // World Cup flag wins over height bands (Charles sheet WC column).
  const divOf = (r) => (r.is_world_cup ? 'world_cup' : divisionFor(r.height_cm, divisions)?.key || '');
  const divSummary = divisions
    .map((d) => {
      const rs = history.filter((r) => divOf(r) === d.key);
      const clears = rs.filter((r) => r.clear_round).length;
      const faults = rs.reduce((t, r) => t + num(r.total_faults), 0);
      return { ...d, rounds: rs.length, clears, faults, pct: rs.length ? (100 * clears) / rs.length : 0 };
    })
    .filter((d) => d.rounds > 0);
  const earnedBadges = divSummary
    .map((d) => ({ ...d, elite: d.clears >= 10 && d.faults <= 12 }))
    .filter((d) => d.clears >= 3 || d.elite);
  const divTotals = divSummary.reduce(
    (t, d) => ({ rounds: t.rounds + d.rounds, clears: t.clears + d.clears }),
    { rounds: 0, clears: 0 });


  const ageYears = h.age ?? (h.year_of_birth ? new Date().getFullYear() - Number(h.year_of_birth) : null);
  const registry = [
    ['Age', ageYears !== null && ageYears !== undefined ? `${ageYears} Years${h.year_of_birth && !h.age ? ` (b. ${h.year_of_birth})` : ''}` : '—'],
    ['Breed', h.breed || '—'],
    ['Gender', h.gender || '—'],
    ['Sire', h.sire || '—'],
    ['Dam', h.dam || '—'],
    ['Breeder', h.breeder || '—'],
  ];

  return (
    <div className="text-[14px] text-slate-100">
      {/* breadcrumb + title */}
      <div className="mb-1 text-[12px] text-faint">
        <Link href="/horses" className="text-muted hover:text-white">Horses</Link>
        <span className="mx-1.5">/</span>
        <span className="text-gold">{h.name} Profile</span>
      </div>
      {/* hero */}
      <div className="mb-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="rounded border border-line bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.12em] text-faint">Equine Subject</div>
              <div className="mt-1 text-[30px] font-extrabold leading-none break-words">{h.name}</div>
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
            </div>
            <div className="flex flex-col items-end gap-2.5 shrink-0">
              <div className="text-center">
                <div className="text-[26px] font-extrabold leading-none tabular-nums text-gold">{horseRating === null || !formEligible ? '–' : horseRating.toFixed(1)}</div>
                <div className="mt-0.5 text-[9px] uppercase tracking-wide text-muted">Rating{formRank ? ` · #${formRank}` : ''}</div>
                {!!roundsNeeded && (
                  <div className="mt-1 text-[10px] text-faint">needs {roundsNeeded} more round{roundsNeeded === 1 ? '' : 's'} to rank</div>
                )}
              </div>
              <WatchButton entityType="horse" entityId={params.id} />
            </div>
          </div>
        </section>

        <section className="rounded border border-line bg-card p-5">
          <h2 className="mb-2 text-[15px] font-bold">Biological Registry</h2>
          <dl>
            {registry.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between border-b border-line/60 py-[9px] text-[13px] last:border-0">
                <dt className="text-muted">{k}</dt>
                <dd className="font-semibold text-slate-100">{k === 'Breeder' && v !== '—'
                  ? <Link href={`/breeders/${encodeURIComponent(v)}`} className="text-sky hover:text-white">{v}</Link>
                  : v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      {/* metrics */}
      <h2 className="text-[15px] font-bold">Circuit Metrics Summary</h2>
      <StatGrid cols={7} className="mt-3">
        {metrics.map((m) => (
          <StatCard
            key={m.label}
            label={m.label}
            delta={m.delta}
            tone={m.good ? 'mint' : 'gold'}
            value={m.value}
            spark={m.data}
            sparkColor={m.color}
          />
        ))}
      </StatGrid>

      {/* competition */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold">Competition Performance</h2>        <span className="flex items-center gap-1.5">
          <ExportCsv rows={history} filename={`${h.name}-record.csv`} />
          {[['', 'All'], ['110-120', '1.10–1.20'], ['120-130', '1.20–1.30'], ['130-140', '1.30–1.40'], ['140-', '1.40m+']].map(([v, l]) => {
            const href = `/horses/${params.id}${v ? `?h=${v}` : ''}`;
            return <Link key={v || 'all'} href={href} className={`text-[11px] rounded-full px-2 py-0.5 border no-underline ${hBand === v ? 'bg-goldbg border-gold text-gold font-bold' : 'border-line text-muted'}`}>{l}</Link>;
          })}
        </span>
      </div>
      <p className="mb-3 mt-0.5 text-[12.5px] text-muted">Historical performance records from the NZ Showjumping Circuit.</p>
      <section className="mb-6 rounded border border-line bg-card p-4">
        <HistoryTable rows={bandHistory} mode="horse" />
      </section>

      <h2 className="text-[15px] font-bold">Season Timeline</h2>
      <p className="mb-3 mt-0.5 text-[12.5px] text-muted">Last rounds at a glance — place, clear/faults, height and rider.</p>
      <section className="mb-6 rounded border border-line bg-card p-4">
        <SeasonTimeline history={history} />
      </section>

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

      <SurfaceSplits rows={splits.data} subject={h.name} />

    </div>
  );
}
