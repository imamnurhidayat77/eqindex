import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJSON } from '../../../lib/api';
import { CARD, H1, NUM, SUB, TABLE, TD, TH } from '../../../lib/tokens';
import { StatCard, StatGrid } from '../../../components/StatCard';

export const revalidate = 30;

export default async function StallionProfile({ params }) {
  const name = decodeURIComponent(params.name);
  const res = await getJSON(`/stallions/${encodeURIComponent(name)}`).catch(() => null);
  if (!res || !res.data) notFound();
  const d = res.data;
  const horses = res.horses || [];
  const num = (v) => (v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString());

  return (
    <>
      <Link href="/stallions" className="text-muted hover:text-white">Stallions</Link>
      <h1 className={H1}>{d.stallion}</h1>
      <p className={SUB}>{d.offspring} offspring on the NZ circuit.</p>
      <StatGrid>
        <StatCard label="Offspring" value={num(d.offspring)} />
        <StatCard label="Starts" value={num(d.starts)} />
        <StatCard label="Wins" value={num(d.wins)} />
        <StatCard label="Points" value={num(d.total_points)} />
        <StatCard label="Clear %" value={d.clear_pct === null ? '—' : `${Number(d.clear_pct).toFixed(1)}%`} />
        <StatCard label="Avg faults" value={d.avg_faults === null ? '—' : Number(d.avg_faults).toFixed(2)} />
      </StatGrid>
      <section className={CARD}>
        <div className="overflow-x-auto">
        <table className={TABLE}>
          <thead><tr><th className={TH}>Offspring</th><th className={TH}>Dam</th><th className={TH}>Breeder</th><th className={TH}>Born</th><th className={`${TH} ${NUM}`}>Starts</th><th className={`${TH} ${NUM}`}>Wins</th><th className={`${TH} ${NUM}`}>Points</th></tr></thead>
          <tbody>
            {horses.map((h) => (
              <tr key={h.horse_id}>
                <td className={TD}><Link href={`/horses/${h.horse_slug || h.horse_id}`} className="text-white font-semibold">{h.horse}</Link></td>
                <td className={TD}>{h.dam || '—'}</td>
                <td className={TD}>{h.breeder ? <Link href={`/breeders/${encodeURIComponent(h.breeder)}`} className="text-sky hover:text-white">{h.breeder}</Link> : '—'}</td>
                <td className={TD}>{h.year_of_birth || '—'}</td>
                <td className={`${TD} ${NUM}`}>{h.starts}</td>
                <td className={`${TD} ${NUM}`}>{h.wins}</td>
                <td className={`${TD} ${NUM}`}><b>{Number(h.total_points)}</b></td>
              </tr>
            ))}
            {!horses.length && <tr><td colSpan={7} className={`${TD} text-muted`}>No offspring recorded.</td></tr>}
          </tbody>
        </table>
        </div>
      </section>
    </>
  );
}
