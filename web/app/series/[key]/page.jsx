import Link from 'next/link';
import { getJSON } from '../../../lib/api';
import { SeriesMatrixTable } from '../../../components/SeriesTables';
import { EmptyState } from '../../../components/EmptyState';

export const revalidate = 30;

const norm = (s) => (s || '').trim().toLowerCase();
const num = (v, d = 0) => (v === null || v === undefined || v === '' ? d : Number(v));

export default async function SeriesPage({ params }) {
  const key = decodeURIComponent(params.key);
  const [d, rankH, rankR] = await Promise.all([
    getJSON(`/series/${key}/detail`).catch(() => null),
    getJSON('/rankings/horses?limit=200').catch(() => ({ data: [] })),
    getJSON('/rankings/riders?limit=200').catch(() => ({ data: [] })),
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
  const { info, standings, events, rounds } = d.data;
  const name = info?.display_name || standings[0]?.series_name || key;

  const horseMap = {};
  for (const h of rankH.data || []) {
    horseMap[norm(h.horse)] = { id: h.horse_id };
  }
  const riderMap = {};
  for (const r of rankR.data || []) {
    riderMap[norm(r.rider)] = { id: r.rider_id };
  }
  const table = (standings || []).map((r) => ({
    ...r, h: horseMap[norm(r.horse)] || null, rd: riderMap[norm(r.rider)] || null,
  }));

  const leader = table[0] || null;
  const evLabels = (rounds && rounds.length ? rounds : events.map((e) => e.event));

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

      <h2 className="text-[15px] font-bold">Points Matrix</h2>
      <p className="mb-3 mt-0.5 text-[12.5px] text-muted">Points from each qualifying event per combination.</p>
      <section className="mb-6 rounded border border-line bg-card p-4">
        <SeriesMatrixTable table={table} evLabels={evLabels} hasDropped={table.some((r) => r.dropped)} />
        {!table.length && (
          <EmptyState
            icon="🏆"
            title="No standings for this series yet"
            hint="Standings appear once classes in this series publish results."
            compact
          />
        )}
      </section>

      <h2 className="mb-3 text-[15px] font-bold">Series Tools</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['All Series', 'Browse every points race', '/series'],
          ['Rankings', 'National points leaderboard', '/rankings?by=points'],
          ['Compare Leaders', 'Head-to-head the top two', leader && table[1] && leader.h && table[1].h ? `/comparison?type=horse&a=${leader.h.id}&b=${table[1].h.id}` : '/comparison'],
        ].map(([t, d, href]) => (
          <Link key={t} href={href} className="group flex items-center justify-between rounded border border-line bg-card p-4 transition hover:border-gold/50">
            <div><div className="text-[13.5px] font-bold text-white">{t}</div><div className="mt-0.5 text-[12px] text-muted">{d}</div></div>
            <span className="text-gold transition group-hover:translate-x-0.5">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
