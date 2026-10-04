import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJSON } from '../../../lib/api';
import { ordinal } from '../../../lib/eq';
import { BADGE, CARD, H1, H2, LINK, LIVE, NUM, SUB, TABLE, TABLEWRAP, TD, TH, badge } from '../../../lib/tokens';
import ClassResults from '../../../components/ClassResults';
import { EventDifficultyTable } from '../../../components/EventTables';
import { StatCard, StatGrid } from '../../../components/StatCard';

export const revalidate = 30;

const pct1 = (v) => `${Number(v).toFixed(1)}%`;
const d = (o) => new Date(o).toLocaleDateString('en-NZ', { month: 'short', year: '2-digit' });

export default async function EventDetail({ params }) {
  const a = await getJSON(`/events/${params.id}/analytics`).catch(() => null);
  if (!a?.event) notFound();
  const e = a.event;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(params.id) && e.slug && e.slug !== params.id) {
    const { redirect } = await import('next/navigation');
    redirect(`/events/${e.slug}`);
  }
  const rounds = a.rounds;
  const maxH = Math.max(0, ...rounds.map((r) => Number(r.height_cm) || 0));
  // Circuit benchmark from career rankings (for the overview deltas).
  const [rankAll] = await Promise.all([
    getJSON('/rankings/horses?limit=200'),
  ]);
  const n = rounds.length;
  const clears = rounds.filter((r) => r.clear_round).length;
  const clearPct = n ? 100 * clears / n : 0;
  const avgF = n ? rounds.reduce((s, r) => s + Number(r.total_faults), 0) / n : 0;
  // Event toughness from raw clear rate (lower clear = tougher track).
  const strength = clearPct >= 50 ? 'Open field' : clearPct >= 35 ? 'Competitive field' : 'Elite field';
  const grade = maxH >= 140 ? 'A-Grade Event' : maxH >= 130 ? 'B-Grade Event' : 'Club Event';
  const horsesN = new Set(rounds.map((r) => r.horse)).size;
  const ridersN = new Set(rounds.map((r) => r.rider)).size;

  // circuit benchmark from career rankings
  const totS = rankAll.data.reduce((s, h) => s + Number(h.starts), 0);
  const totC = rankAll.data.reduce((s, h) => s + Number(h.clears), 0);
  const circClear = totS ? 100 * totC / totS : 0;
  const circAvg = totS ? rankAll.data.reduce((s, h) => s + Number(h.avg_faults) * Number(h.starts), 0) / totS : 0;
  const fmtDate = `${d(e.date_start)}–${d(e.date_end)}`;

  // height + fault distributions
  const buckets = [[100, 110], [110, 120], [120, 130], [130, 140], [140, 999]];
  const hb = buckets.map(([lo, hi]) => {
    const rs = rounds.filter((r) => Number(r.height_cm) >= lo && Number(r.height_cm) < hi);
    return { label: hi >= 999 ? '1.40m - 1.50m+' : `1.${String(lo).slice(1)}0m - 1.${String(hi).slice(1)}0m`, n: rs.length, p: rs.length ? 100 * rs.filter((r) => r.clear_round).length / rs.length : 0 };
  }).filter((b) => b.n > 0);
  const fb = [
    ['Clear (0 Faults)', rounds.filter((r) => Number(r.total_faults) === 0).length, '#00C853'],
    ['1 - 4 Faults', rounds.filter((r) => Number(r.total_faults) >= 1 && Number(r.total_faults) <= 4).length, '#4C9AFF'],
    ['5 - 8 Faults', rounds.filter((r) => Number(r.total_faults) >= 5 && Number(r.total_faults) <= 8).length, '#FFD700'],
    ['9+ Faults', rounds.filter((r) => Number(r.total_faults) >= 9).length, '#FF1744'],
  ].map(([label, c, color]) => ({ label, p: n ? 100 * c / n : 0, color }));

  // Top lists derived from rounds (saves 3 aggregate queries in the API).
  const grades = (r) => [(r.finish_place ?? 9999), Number(r.total_faults), (r.time_seconds ?? 9999)];
  const cmpR = (x, y) => grades(x)[0] - grades(y)[0] || grades(x)[1] - grades(y)[1] || grades(x)[2] - grades(y)[2];
  const seenHorse = new Set();
  const topHorses = [...rounds].sort(cmpR).filter((r) => {
    if (seenHorse.has(r.horse_id)) return false;
    seenHorse.add(r.horse_id);
    return true;
  }).slice(0, 5);
  const rAgg = {};
  for (const r of rounds) {
    const g = (rAgg[r.rider_id] ||= { rider_id: r.rider_id, rider: r.rider, starts: 0, clears: 0, faults: 0, horses: new Set() });
    g.starts++; g.faults += Number(r.total_faults);
    if (r.clear_round) g.clears++;
    g.horses.add(r.horse_id);
  }
  const topRiders = Object.values(rAgg).map((g) => ({
    ...g, horses_ridden: g.horses.size,
    clear_pct: 100 * g.clears / g.starts, avg_faults: g.faults / g.starts,
  })).sort((x, y) => y.clear_pct - x.clear_pct || x.avg_faults - y.avg_faults).slice(0, 5);
  // per-class result groups (accordion), sorted by placing, nulls last
  const byClass = {};
  for (const r of rounds) {
    const k = r.class_id || r.class_name;
    (byClass[k] ||= { class_id: r.class_id, name: r.class_name || 'Unnamed class', height_cm: r.height_cm, class_type: null, rounds: [] });
    byClass[k].rounds.push(r);
  }
  const classMeta = Object.fromEntries((a.classes || []).map((c) => [c.class_id, c]));
  const classOrder = Object.fromEntries((a.classes || []).map((c, i) => [c.class_id, i]));
  const groups = Object.values(byClass).map((g) => {
    const meta = (g.class_id && classMeta[g.class_id]) || {};
    for (const k of ['class_type', 'class_number', 'format', 'sponsor', 'series_key', 'result_status', 'height_cm', 'arena_type', 'surface']) {
      if (g[k] === null || g[k] === undefined) g[k] = meta[k] ?? g[k];
    }
    if (!g.height_cm && meta.height_cm) g.height_cm = meta.height_cm;
    const rs = [...g.rounds].sort((x, y) => (x.finish_place ?? 9999) - (y.finish_place ?? 9999));
    return { ...g, rounds: rs, clears: rs.filter((r) => r.clear_round).length };
  }).sort((x, y) => (classOrder[x.class_id] ?? 999) - (classOrder[y.class_id] ?? 999));

  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-3.5">
        <div>
          <h1 className={H1}>Event Intelligence Overview</h1>
          <p className={SUB}>Detailed physical arena, class, horse, and rider metadata from New Zealand&apos;s premier circuits.</p>
        </div>
        <div className="flex gap-2.5 items-center shrink-0 pt-1.5">
          <span className={LIVE}>● LIVE EVENT FEED</span>
          <span className="text-muted border border-line rounded-full px-3 py-[5px] text-xs">◷ Updated 10 min ago</span>
        </div>
      </div>

      <section className={CARD}>
        <div className="flex items-center gap-2 mb-3">
          <h2 className={H2}>🎖 Active Competition Summary</h2>
          <div className="flex-1" />
          <span className={badge(BADGE.gold)}>{grade}</span>
        </div>
        <div className="flex gap-5 items-center">
          <div>
            <div className="text-[22px] font-extrabold">{e.name}</div>
            <div className="text-muted text-xs mt-1.5">
              Venue: <b className="text-body">{e.venue}</b>&nbsp;&nbsp;
              Region: <b className="text-body">{e.region}, NZ</b>&nbsp;&nbsp;
              Arena: <b className="text-body">{e.arena_type}</b>&nbsp;&nbsp;
              Date: <b className="text-body">{fmtDate}</b>
              {e.tier && <>&nbsp;&nbsp;Tier: <b className="text-gold">{e.tier}</b></>}
            </div>
            {(e.series_flags || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {e.series_flags.map((f) => (
                  <span key={f} className="text-[11px] font-bold border border-line text-muted rounded-full px-2 py-[2px]">{f}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <h2 className={H2}>Circuit Performance Overview</h2>
      <p className={SUB}>Consolidated statistics of {e.name} Event</p>
      {(a.hidden?.hidden_classes > 0) && (
        <p className="text-[12px] text-faint -mt-3 mb-6">
          {a.hidden.hidden_classes} class{a.hidden.hidden_classes === 1 ? '' : 'es'} ({a.hidden.hidden_rounds} rounds)
          excluded from analytics by admin — data retained in the DB.
        </p>
      )}
      <StatGrid cols={7}>
        {[
          ['Total Classes', null, a.classes.length],
          ['Total Rounds', null, n],
          ['Horses Entered', null, horsesN],
          ['Riders Entered', null, ridersN],
          ['Clear Rate', `${(clearPct - circClear) >= 0 ? '+' : ''}${(clearPct - circClear).toFixed(1)}% vs avg`, `${clearPct.toFixed(0)}%`],
          ['Avg Faults', `${(avgF - circAvg) >= 0 ? '+' : ''}${(avgF - circAvg).toFixed(1)} penalty`, avgF.toFixed(1)],
          ['Clear Rounds', `${n} rounds`, clears],
        ].map(([lbl, delta, big]) => (
          <StatCard key={lbl} label={lbl} delta={delta} value={big} />
        ))}
      </StatGrid>

      <h2 className={H2}>Class Results</h2>
      <p className={SUB}>Every round of this event, grouped by class — expand to inspect placings, faults and times.</p>
      <ClassResults groups={groups} />

      <h2 className={H2}>Class Difficulty Analysis</h2>
      <p className={SUB}>Clear rate and average faults per class.</p>
      <section className={CARD}>
        <EventDifficultyTable rows={a.classes} />
      </section>

      <h2 className={H2}>Competition Performance Analytics</h2>
      <p className={SUB}>Clear rates and faults across rounds</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className={CARD}>
          <h2 className={H2}>Clear Round Distribution by Height</h2>
          {hb.map((b) => (
            <div className="my-3" key={b.label}>
              <div className="flex justify-between text-[13px] mb-[5px]"><span className="text-muted">{b.label}</span><span className="text-gold font-semibold">{b.p.toFixed(0)}%</span></div>
              <div className="bg-line rounded h-2"><div className="h-2 rounded bg-gold" style={{ width: `${b.p}%` }} /></div>
            </div>
          ))}
        </section>
        <section className={CARD}>
          <h2 className={H2}>Fault Distribution Across Rounds</h2>
          {fb.map((x) => (
            <div className="my-3" key={x.label}>
              <div className="flex justify-between text-[13px] mb-[5px]"><span className="text-muted">{x.label}</span><span className="font-semibold" style={{ color: x.color }}>{x.p.toFixed(0)}% of rounds</span></div>
              <div className="bg-line rounded h-2"><div className="h-2 rounded" style={{ width: `${x.p}%`, background: x.color }} /></div>
            </div>
          ))}
        </section>
      </div>

      <h2 className={H2}>Top Performing Horses</h2>
      <p className={SUB}>Leading equine ranking generated for the {e.name} class structure.</p>
      <section className={CARD}>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr><th className={TH}>Rank</th><th className={TH}>Horse Name</th><th className={TH}>Rider Name</th><th className={TH}>Height Class</th><th className={`${TH} ${NUM}`}>Jump Faults</th><th className={TH}>Time</th><th>Placing</th></tr></thead>
          <tbody>
            {topHorses.map((h, i) => (
              <tr key={h.horse_id}>
                <td className={i === 0 ? 'text-gold font-bold' : ''}>#{i + 1}</td>
                <td className={TD}><b>{h.horse}</b></td>
                <td className={TD}>{h.rider}</td>
                <td className={TD}>{h.height_cm ? `${(Number(h.height_cm) / 100).toFixed(2)}m` : '–'}</td>
                <td className={`${TD} ${NUM} ${Number(h.jump_faults) === 0 ? 'text-moss' : 'text-blood'}`}>{h.jump_faults}</td>
                <td className={TD}>{h.time_seconds === null ? '–' : `${h.time_seconds}s`}</td>
                <td className={TD}>{i === 0 ? <span className={badge(BADGE.goldfill)}>{ordinal(h.finish_place)}</span> : ordinal(h.finish_place)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <h2 className={H2}>Top Performing Riders</h2>
      <p className={SUB}>Leading national showjumping athletes.</p>
      <section className={CARD}>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr><th className={TH}>Rank</th><th className={TH}>Rider Name</th><th className={TH}>Horses Ridden</th><th className={TH}>Rounds</th><th className={`${TH} ${NUM}`}>Clear %</th><th className={`${TH} ${NUM}`}>Avg Faults</th></tr></thead>
          <tbody>
            {topRiders.map((r, i) => (
              <tr key={r.rider_id}>
                <td className={i === 0 ? 'text-gold font-bold' : ''}>#{i + 1}</td>
                <td className={TD}><b>{r.rider}</b></td>
                <td className={TD}>{r.horses_ridden} Horse{r.horses_ridden === 1 ? '' : 's'}</td>
                <td className={TD}>{r.starts} Round{r.starts === 1 ? '' : 's'}</td>
                <td className={`${TD} ${NUM} text-moss`}>{pct1(r.clear_pct)}</td>
                <td className={`${TD} ${NUM}`}>{Number(r.avg_faults).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

    </>
  );
}
