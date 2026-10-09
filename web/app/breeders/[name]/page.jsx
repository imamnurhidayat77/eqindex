import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJSON } from '../../../lib/api';
import { CARD, H1, NUM, SUB, TABLE, TD, TH } from '../../../lib/tokens';
import { StatCard, StatGrid } from '../../../components/StatCard';

export const revalidate = 30;

// v0.3 fallback divisions when no active scoring version is published
// (same source as the horse profile division summary).
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

export default async function BreederProfile({ params }) {
  const name = decodeURIComponent(params.name);
  const [res, scoring] = await Promise.all([
    getJSON(`/breeders/${encodeURIComponent(name)}`).catch(() => null),
    getJSON('/scoring/active').catch(() => null),
  ]);
  if (!res || !res.data) notFound();
  const divisions = scoring?.data?.params?.divisions?.length ? scoring.data.params.divisions : DEFAULT_DIVS;
  const d = res.data;
  const horses = res.horses || [];
  const divSummary = divisions
    .map((div) => {
      const rows = (res.heights || []).filter(
        (x) => divisionFor(x.height_cm, divisions)?.key === div.key);
      const rounds = rows.reduce((t, x) => t + Number(x.starts), 0);
      const clears = rows.reduce((t, x) => t + Number(x.clears), 0);
      const wins = rows.reduce((t, x) => t + Number(x.wins), 0);
      const points = rows.reduce((t, x) => t + Number(x.total_points), 0);
      return { ...div, rounds, clears, wins, points, pct: rounds ? (100 * clears) / rounds : 0 };
    })
    .filter((x) => x.rounds > 0);
  const divTotals = divSummary.reduce(
    (t, x) => ({ rounds: t.rounds + x.rounds, clears: t.clears + x.clears, wins: t.wins + x.wins, points: t.points + x.points }),
    { rounds: 0, clears: 0, wins: 0, points: 0 });
  const num = (v) => (v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString());

  return (
    <>
      <Link href="/breeders" className="text-muted hover:text-white">Breeders</Link>
      <h1 className={H1}>{d.breeder}</h1>
      <p className={SUB}>{d.horses} horse{d.horses === 1 ? '' : 's'} on the NZ circuit.</p>
      <StatGrid>
        <StatCard label="Horses" value={num(d.horses)} />
        <StatCard label="Starts" value={num(d.starts)} />
        <StatCard label="Wins" value={num(d.wins)} />
        <StatCard label="Clear %" value={d.clear_pct === null ? '—' : `${Number(d.clear_pct).toFixed(1)}%`} />
        <StatCard label="Avg faults" value={d.avg_faults === null ? '—' : Number(d.avg_faults).toFixed(2)} />
      </StatGrid>
      {!!divSummary.length && (
        <>
          <h2 className="text-[15px] font-bold">Division summary</h2>
          <p className="mb-3 mt-0.5 text-[12.5px] text-muted">Rounds and clears per division across all offspring.</p>
          <section className="mb-6 rounded border border-line bg-card p-4">
            <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="border-b border-line px-3 py-2.5 font-semibold"></th>
                {divSummary.map((x) => (
                  <th key={x.key} className="border-b border-line px-3 py-2.5 font-semibold text-right">
                    <span className="inline-flex items-center gap-1.5 justify-end">
                      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: x.color || '#888' }} />
                      {x.label}
                    </span>
                  </th>
                ))}
                <th className="border-b border-line px-3 py-2.5 font-semibold text-right">Total</th>
              </tr></thead>
              <tbody>
                <tr className="border-b border-line/50 hover:bg-white/[0.02]">
                  <td className="px-3 py-2.5 text-muted">Rounds</td>
                  {divSummary.map((x) => (
                    <td key={x.key} className="px-3 py-2.5 text-right text-muted">{x.rounds}</td>
                  ))}
                  <td className="px-3 py-2.5 text-right"><b>{divTotals.rounds}</b></td>
                </tr>
                <tr className="border-b border-line/50 hover:bg-white/[0.02]">
                  <td className="px-3 py-2.5 text-muted">Clear</td>
                  {divSummary.map((x) => (
                    <td key={x.key} className="px-3 py-2.5 text-right text-muted">{x.clears}</td>
                  ))}
                  <td className="px-3 py-2.5 text-right"><b>{divTotals.clears}</b></td>
                </tr>
                <tr className="border-b border-line/50 hover:bg-white/[0.02]">
                  <td className="px-3 py-2.5 text-muted">Clear %</td>
                  {divSummary.map((x) => (
                    <td key={x.key} className="px-3 py-2.5 text-right font-bold text-moss">{x.pct.toFixed(1)}%</td>
                  ))}
                  <td className="px-3 py-2.5 text-right font-bold text-gold">
                    {divTotals.rounds ? `${((100 * divTotals.clears) / divTotals.rounds).toFixed(1)}%` : '–'}
                  </td>
                </tr>
                <tr className="hover:bg-white/[0.02]">
                  <td className="px-3 py-2.5 text-muted">Wins</td>
                  {divSummary.map((x) => (
                    <td key={x.key} className="px-3 py-2.5 text-right text-muted">{x.wins}</td>
                  ))}
                  <td className="px-3 py-2.5 text-right"><b>{divTotals.wins}</b></td>
                </tr>
              </tbody>
            </table>
            </div>
          </section>
        </>
      )}
      <section className={CARD}>
        <div className="overflow-x-auto">
        <table className={TABLE}>
          <thead><tr><th className={TH}>Horse</th><th className={TH}>Sire × Dam</th><th className={TH}>Born</th><th className={`${TH} ${NUM}`}>Starts</th><th className={`${TH} ${NUM}`}>Wins</th></tr></thead>
          <tbody>
            {horses.map((h) => (
              <tr key={h.horse_id}>
                <td className={TD}><Link href={`/horses/${h.horse_slug || h.horse_id}`} className="text-white font-semibold">{h.horse}</Link></td>
                <td className={TD}>{[h.sire, h.dam].filter(Boolean).join(' × ') || '—'}</td>
                <td className={TD}>{h.year_of_birth || '—'}</td>
                <td className={`${TD} ${NUM}`}>{h.starts}</td>
                <td className={`${TD} ${NUM}`}>{h.wins}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    </>
  );
}
