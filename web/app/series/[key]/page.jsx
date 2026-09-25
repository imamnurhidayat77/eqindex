import { getJSON } from '../../../lib/api';
import { eqScore } from '../../../lib/eq';
import { statusBadge } from '../../../lib/tokens';

export const dynamic = 'force-dynamic';

const norm = (s) => (s || '').trim().toLowerCase();
const num = (v, d = 0) => (v === null || v === undefined || v === '' ? d : Number(v));

export default async function SeriesPage({ params }) {
  const key = decodeURIComponent(params.key);
  const [s, rankH, rankR] = await Promise.all([
    getJSON(`/series/${key}/standings?limit=100`).catch(() => ({ data: [] })),
    getJSON('/rankings/horses?limit=200').catch(() => ({ data: [] })),
    getJSON('/rankings/riders?limit=200').catch(() => ({ data: [] })),
  ]);
  const rows = s.data || [];
  const first = rows[0];

  const horseMap = {};
  for (const h of rankH.data || []) {
    horseMap[norm(h.horse)] = {
      id: h.horse_id, eq: eqScore(h.clear_pct, h.avg_faults, h.starts),
      clear: num(h.clear_pct), starts: num(h.starts),
    };
  }
  const riderMap = {};
  for (const r of rankR.data || []) {
    riderMap[norm(r.rider)] = {
      id: r.rider_id, eq: eqScore(r.clear_pct, r.avg_faults, r.starts),
      clear: num(r.clear_pct), starts: num(r.starts),
    };
  }

  const table = rows.map((r) => {
    const h = horseMap[norm(r.horse_name)] || null;
    const rd = riderMap[norm(r.rider_name)] || null;
    return { ...r, pts: num(r.total_points), shows: num(r.shows_counted), rank: num(r.rank), h, rd };
  }).sort((a, b) => a.rank - b.rank || b.pts - a.pts);

  const leader = table[0] || null;
  const totalPts = table.reduce((x, r) => x + r.pts, 0);
  const avgPts = table.length ? totalPts / table.length : 0;
  const maxShows = table.reduce((x, r) => Math.max(x, r.shows), 0);
  const gap = leader && table[1] ? leader.pts - table[1].pts : 0;
  const maxPts = leader ? leader.pts : 1;

  const insights = [];
  if (leader) {
    insights.push(`${leader.rider_name} leads ${first.series_name} on ${leader.horse_name} with ${leader.pts} points${gap ? ` — ${gap} clear of second place` : ''}.`);
    const withEq = table.filter((r) => r.h?.eq);
    if (withEq.length) {
      const top = [...withEq].sort((a, b) => b.h.eq - a.h.eq)[0];
      insights.push(`Highest EQ in the field is ${top.horse_name} (${top.h.eq}) — ${top.rank === 1 ? 'matching' : 'pressuring'} the series lead.`);
    }
    insights.push(`Field averages ${avgPts.toFixed(0)} points across ${table.length} combinations with up to ${maxShows} shows counted.`);
  }

  return (
    <div className="text-[14px] text-slate-100">
      <div className="mb-1 text-[12px] text-faint">
        <a href="/series" className="text-muted hover:text-white">Series</a>
        <span className="mx-1.5">/</span>
        <span className="text-gold">{first ? first.series_name : 'Detail'}</span>
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px] font-extrabold tracking-tight">{first ? first.series_name : 'Series'}</h1>
        <span className="rounded-full border border-gold/60 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-gold">◦ Points Race</span>
        <span className="rounded-full border border-mint/40 bg-mint/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-mint">◦ Published table · EQ computed independently</span>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="rounded border border-line bg-card p-5">
          <div className="text-[11px] uppercase tracking-[0.12em] text-faint">Series Leader</div>
          {leader ? (
            <>
              <div className="mt-1 text-[24px] font-extrabold leading-tight">{leader.rider_name} <span className="text-muted font-semibold">× {leader.horse_name}</span></div>
              <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-2">
                <div><span className="text-[30px] font-extrabold text-gold">{leader.pts}</span> <span className="text-muted text-[13px]">points</span></div>
                <div className="pb-1 text-[13px] text-muted">{leader.shows} shows counted · Rank #{leader.rank}</div>
              </div>
              <div className="mt-4 rounded bg-card2 p-3 text-[12.5px] italic leading-relaxed text-muted">
                “{leader.rider_name} sets the pace in {first.event_name} — consistency across {leader.shows} counting shows built an unbroken points streak.”
              </div>
            </>
          ) : <p className="mt-2 text-muted">No standings published yet.</p>}
        </section>
        <section className="rounded border border-line bg-card p-5">
          <h2 className="mb-2 text-[15px] font-bold">Series Registry</h2>
          <dl>
            {[
              ['Season', (first?.season || '—').replace('-', '/')],
              ['Event', first?.event_name || '—'],
              ['Entries', String(table.length)],
              ['Shows Counted', String(maxShows)],
              ['Points Leader', leader ? `${leader.rider_name}` : '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between border-b border-line/60 py-[9px] text-[13px] last:border-0">
                <dt className="text-muted">{k}</dt>
                <dd className="font-semibold text-slate-100">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <h2 className="text-[15px] font-bold">Series Metrics</h2>
      <div className="mb-6 mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Combinations', String(table.length)],
          ['Points Awarded', String(totalPts)],
          ['Average Points', avgPts.toFixed(0)],
          ['Lead Gap', gap ? `+${gap}` : '—'],
        ].map(([l, v]) => (
          <div key={l} className="rounded border border-line bg-card p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{l}</div>
            <div className="mt-1 text-[26px] font-extrabold leading-none">{v}</div>
          </div>
        ))}
      </div>

      {table.length >= 3 && (
        <>
          <h2 className="mb-3 text-[15px] font-bold">Podium</h2>
          <div className="mb-6 grid gap-4 md:grid-cols-3">
            {table.slice(0, 3).map((r, i) => (
              <div key={i} className={`rounded border bg-card p-4 ${i === 0 ? 'border-gold/60' : 'border-line'}`}>
                <div className="mb-1 flex items-center justify-between">
                  <span className={`text-[12px] font-extrabold ${i === 0 ? 'text-gold' : 'text-muted'}`}>#{r.rank}</span>
                  <span className={statusBadge(i === 0 ? '1st' : i === 1 ? '2nd' : '3rd')}>{i === 0 ? 'Leader' : `Chaser +${r.pts ? leader.pts - r.pts : 0}`}</span>
                </div>
                <div className="font-bold">{r.rider_name}</div>
                <div className="text-[12.5px] text-muted">{r.horse_name}</div>
                <div className="mt-2 text-[20px] font-extrabold">{r.pts} <span className="text-[12px] font-semibold text-muted">pts · {r.shows} shows</span></div>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="mb-3 text-[15px] font-bold">Points Race</h2>
      <section className="mb-6 rounded border border-line bg-card p-5">
        <div className="space-y-2.5">
          {table.slice(0, 10).map((r) => (
            <div key={`${r.rider_name}-${r.horse_name}`} className="grid grid-cols-[150px_1fr_52px] items-center gap-3 text-[12.5px]">
              <span className="truncate font-medium">#{r.rank} {r.rider_name}</span>
              <div className="h-2 rounded bg-[#2A2A2A]">
                <div className={`h-2 rounded ${r.rank === 1 ? 'bg-gold' : 'bg-info'}`} style={{ width: `${(100 * r.pts) / maxPts}%` }} />
              </div>
              <span className="text-right font-bold tabular-nums">{r.pts}</span>
            </div>
          ))}
          {!table.length && <p className="text-muted">No points recorded.</p>}
        </div>
      </section>

      <h2 className="text-[15px] font-bold">Full Standings</h2>
      <p className="mb-3 mt-0.5 text-[12.5px] text-muted">Every combination in {first?.series_name || 'this series'} — EQ matched from career rankings.</p>
      <section className="mb-6 overflow-x-auto rounded border border-line bg-card">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="border-b border-line px-3 py-2.5 font-semibold">Rank</th>
              <th className="border-b border-line px-3 py-2.5 font-semibold">Rider</th>
              <th className="border-b border-line px-3 py-2.5 font-semibold">Horse</th>
              <th className="border-b border-line px-3 py-2.5 text-right font-semibold">Points</th>
              <th className="border-b border-line px-3 py-2.5 text-right font-semibold">Shows</th>
              <th className="border-b border-line px-3 py-2.5 text-right font-semibold">Gap</th>
              <th className="border-b border-line px-3 py-2.5 text-right font-semibold">Horse EQ</th>
            </tr>
          </thead>
          <tbody>
            {table.map((r) => (
              <tr key={`${r.rider_name}-${r.horse_name}`} className="border-b border-line/50 last:border-0 hover:bg-white/[0.02]">
                <td className="px-3 py-2.5"><span className={statusBadge(r.rank === 1 ? '1st' : r.rank === 2 ? '2nd' : r.rank === 3 ? '3rd' : 'stable')}>#{r.rank}</span></td>
                <td className="px-3 py-2.5 font-semibold">
                  {r.rd ? <a href={`/riders/${r.rd.id}`} className="text-white hover:text-gold">{r.rider_name}</a> : r.rider_name}
                </td>
                <td className="px-3 py-2.5">
                  {r.h ? <a href={`/horses/${r.h.id}`} className="text-gold hover:underline">{r.horse_name}</a> : <span className="text-muted">{r.horse_name}</span>}
                </td>
                <td className="px-3 py-2.5 text-right font-extrabold">{r.pts}</td>
                <td className="px-3 py-2.5 text-right text-muted">{r.shows}</td>
                <td className="px-3 py-2.5 text-right text-muted">{r.rank === 1 ? '—' : `+${leader.pts - r.pts}`}</td>
                <td className="px-3 py-2.5 text-right font-bold text-gold">{r.h ? r.h.eq : '—'}</td>
              </tr>
            ))}
            {!table.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted">No standings for this series yet.</td></tr>}
          </tbody>
        </table>
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
          ['Rankings', 'National EQ leaderboard', '/rankings'],
          ['Compare Leaders', 'Head-to-head the top two', leader && table[1] && leader.h && table[1].h ? `/comparison?type=horse&a=${leader.h.id}&b=${table[1].h.id}` : '/comparison'],
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
