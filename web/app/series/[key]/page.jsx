import Link from 'next/link';
import { getJSON } from '../../../lib/api';
import { SeriesRiderTable } from '../../../components/SeriesTables';
import { EmptyState } from '../../../components/EmptyState';

export const revalidate = 30;

const num = (v, d = 0) => (v === null || v === undefined || v === '' ? d : Number(v));

export default async function SeriesPage({ params }) {
  const key = decodeURIComponent(params.key);
  const [d] = await Promise.all([
    getJSON(`/series/${key}/detail`).catch(() => null),
  ]);
  if (!d) {
    return (
      <div className="text-[14px] text-slate-100">
        <div className="mb-1 text-[12px] text-faint">
          <Link href="/series" className="text-muted hover:text-white">Series</Link>
          <span className="mx-1.5">/</span><span className="text-gold">Not found</span>
        </div>
        <h1 className="text-[26px] font-extrabold tracking-tight">Series not found</h1>
        <p className="text-muted">No standings published for this key.</p>
      </div>
    );
  }
  const { info, standings, events } = d.data;
  const name = info?.display_name || standings[0]?.series_name || key;

  // Series ranks riders, not combinations: merge every horse's points
  // into the rider's total.
  const byRider = {};
  for (const r of standings || []) {
    const k = r.rider || 'Unknown rider';
    const g = (byRider[k] ||= {
      rider: k,
      rd: r.rider_id ? { id: r.rider_id, rider_slug: r.rider_slug } : null,
      total: 0, horses: [],
    });
    g.total += Number(r.total) || 0;
    g.horses.push({
      horse: r.horse,
      total: Number(r.total) || 0,
      h: r.horse_id ? { id: r.horse_id, horse_slug: r.horse_slug } : null,
    });
  }
  const table = Object.values(byRider)
    .map((g) => ({ ...g, horses: g.horses.sort((a, b) => b.total - a.total) }))
    .sort((a, b) => b.total - a.total);

  return (
    <div className="text-[14px] text-slate-100">
      <div className="mb-1 text-[12px] text-faint">
        <Link href="/series" className="text-muted hover:text-white">Series</Link>
        <span className="mx-1.5">/</span>
        <span className="text-gold">{name}</span>
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-[26px] font-extrabold tracking-tight">{name}</h1>
        <span className="rounded-full border border-gold/60 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-gold">◦ Points Race</span>
      </div>

      <h2 className="text-[15px] font-bold">Standings</h2>
      <p className="mb-3 mt-0.5 text-[12.5px] text-muted">Rider totals across all horses — click a row for the per-horse breakdown.</p>
      <section className="mb-6 rounded border border-line bg-card p-4">
        <SeriesRiderTable riders={table} />
        {!table.length && (
          <EmptyState
            icon="🏆"
            title="No standings for this series yet"
            hint="Standings appear once classes in this series publish results."
            compact
          />
        )}
      </section>

    </div>
  );
}
