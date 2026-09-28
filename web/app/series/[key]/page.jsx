import Link from 'next/link';
import { getJSON } from '../../../lib/api';
import { eqScore } from '../../../lib/eq';
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
  const { info, standings, events, source, last_calculated } = d.data;
  const name = info?.display_name || standings[0]?.series_name || key;

  const horseMap = {};
  for (const h of rankH.data || []) {
    horseMap[norm(h.horse)] = {
      id: h.horse_id, eq: eqScore(h.clear_pct, h.avg_faults, h.starts),
    };
  }
  const riderMap = {};
  for (const r of rankR.data || []) {
    riderMap[norm(r.rider)] = { id: r.rider_id };
  }
  const table = (standings || []).map((r) => ({
    ...r, h: horseMap[norm(r.horse)] || null, rd: riderMap[norm(r.rider)] || null,
  }));

  const leader = table[0] || null;
  const totalPts = table.reduce((x, r) => x + num(r.total), 0);
  const maxPts = leader ? num(leader.total) || 1 : 1;
  const gap = leader && table[1] ? num(leader.total) - num(table[1].total) : 0;
  const doneEv = events.filter((e) => e.completed === true);
  const openEv = events.filter((e) => e.completed === false);
  const unkEv = events.filter((e) => e.completed === null || e.completed === undefined);
  const evLabels = events.map((e) => e.event);

  const insights = [];
  if (leader) {
    insights.push(`${leader.rider} leads ${name} on ${leader.horse} with ${leader.total} points${gap ? ` — ${gap} clear of second` : ''}.`);
    if (leader.dropped) insights.push(`Best-of-${(info?.best_of || '?')} applied: ${leader.dropped} lowest score${leader.dropped === 1 ? '' : 's'} dropped (${leader.dropped_pts} pts).`);
    insights.push(`${doneEv.length} of ${events.length} qualifying events completed${openEv.length ? `, ${openEv.length} remaining` : ''}.`);
  }

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
        {source === 'official' || info?.is_official ? (
          <span className="rounded-full border border-mint/40 bg-mint/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-mint">◦ Official{info?.official_source ? ` · ${info.official_source}` : ''}</span>
        ) : (
          <span className="rounded-full border border-info/40 bg-info/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-info">◦ Independent calculation</span>
        )}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="rounded border border-line bg-card p-5">
          <div className="text-[11px] uppercase tracking-[0.12em] text-faint">Series Leader</div>
          {leader ? (
            <>
              <div className="mt-1 text-[24px] font-extrabold leading-tight">{leader.rider} <span className="text-muted font-semibold">× {leader.horse}</span></div>
              <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-2">
                <div><span className="text-[30px] font-extrabold text-gold">{leader.total}</span> <span className="text-muted text-[13px]">points</span></div>
                <div className="pb-1 text-[13px] text-muted">
                  {Object.keys(leader.events || {}).length} scoring events · Rank #{leader.rank}
                  {leader.dropped ? ` · ${leader.dropped} dropped` : ''}
                </div>
              </div>
              {info?.qual_rules && (
                <div className="mt-4 rounded bg-card2 p-3 text-[12.5px] leading-relaxed text-muted">
                  <b className="text-white">Qualification:</b> {info.qual_rules}
                </div>
              )}
            </>
          ) : <p className="mt-2 text-muted">No standings published yet.</p>}
        </section>
        <section className="rounded border border-line bg-card p-5">
          <h2 className="mb-2 text-[15px] font-bold">Series Registry</h2>
          <dl>
            {[
              ['Status', source === 'official' || info?.is_official ? 'Official' : 'Independent'],
              ['Events completed', `${doneEv.length}${unkEv.length ? ` (+${unkEv.length} undated)` : ''} / ${events.length}`],
              ['Events remaining', String(openEv.length)],
              ['Best-of rule', info?.best_of ? `Best ${info.best_of}` : 'All count'],
              ['Entries', String(table.length)],
              ['Last calculated', last_calculated ? String(last_calculated).slice(0, 16).replace('T', ' ') : '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between border-b border-line/60 py-[9px] text-[13px] last:border-0">
                <dt className="text-muted">{k}</dt>
                <dd className="font-semibold text-slate-100">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
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

      <h2 className="mb-3 text-[15px] font-bold">Points Race</h2>
      <section className="mb-6 rounded border border-line bg-card p-5">
        <div className="space-y-2.5">
          {table.slice(0, 10).map((r) => (
            <div key={`${r.rider}-${r.horse}`} className="grid grid-cols-[150px_1fr_52px] items-center gap-3 text-[12.5px]">
              <span className="truncate font-medium">#{r.rank} {r.rider}</span>
              <div className="h-2 rounded bg-[#2A2A2A]">
                <div className={`h-2 rounded ${r.rank === 1 ? 'bg-gold' : 'bg-info'}`} style={{ width: `${(100 * num(r.total)) / maxPts}%` }} />
              </div>
              <span className="text-right font-bold tabular-nums">{r.total}</span>
            </div>
          ))}
          {!table.length && (
            <EmptyState
              icon="🏆"
              title="No points recorded yet"
              hint="Points appear once classes in this series publish results."
              compact
            />
          )}
        </div>
      </section>

      {!!insights.length && (
        <>
          <h2 className="mb-3 text-[15px] font-bold">Series Intelligence</h2>
          <div className="mb-6 grid gap-4 md:grid-cols-3">
            {insights.map((t, i) => (
              <div key={i} className="rounded border border-line bg-card p-4">
                <div className="mb-2 text-[11px] font-bold text-gold">ACTIVE SIGNAL</div>
                <p className="text-[12.5px] leading-relaxed text-muted">{t}</p>
              </div>
            ))}
          </div>
        </>
      )}

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
