import Link from 'next/link';
import { cookies } from 'next/headers';
import { getJSON, getPrivateJSON } from '../../lib/api';
import { CARD, H1, SUB, LIVE } from '../../lib/tokens';
import { trendBadge } from '../../lib/eq';
import WatchlistView from '../../components/WatchlistView';

export const dynamic = 'force-dynamic';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(ds) {
  if (!ds) return '–';
  const d = new Date(ds);
  if (Number.isNaN(d.getTime())) return '–';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// Honest relative time: future dates (scheduled data) fall back to a plain date.
function fmtRel(ds, now) {
  if (!ds) return '–';
  const d = new Date(ds);
  if (Number.isNaN(d.getTime())) return '–';
  const diff = now - d.getTime();
  if (diff < 0) return fmtDate(ds);
  const h = diff / 36e5;
  if (h < 1) return `${Math.max(1, Math.round(diff / 6e4))} min ago`;
  if (h < 24) return `${Math.round(h)} hour${Math.round(h) === 1 ? '' : 's'} ago`;
  if (h < 48) return 'Yesterday';
  if (h < 24 * 7) return `${Math.round(h / 24)} days ago`;
  return fmtDate(ds);
}

// Height bands fans actually talk about: 1.00 → 1.40+.
const BANDS = [
  { key: '100', label: '≤1.00m', lo: 0, hi: 105 },
  { key: '110', label: '1.10m', lo: 105, hi: 115 },
  { key: '120', label: '1.20m', lo: 115, hi: 125 },
  { key: '130', label: '1.30m', lo: 125, hi: 135 },
  { key: '140', label: '1.40m+', lo: 135, hi: 999 },
];

function bandOf(cm) {
  if (cm === null || cm === undefined || cm === '' || Number.isNaN(Number(cm))) return null;
  const n = Number(cm);
  return BANDS.find((b) => n >= b.lo && n < b.hi) || null;
}

function heightBands(history) {
  const acc = Object.fromEntries(BANDS.map((b) => [b.key, { ...b, rounds: 0, clears: 0 }]));
  for (const r of history || []) {
    const b = bandOf(r.height_cm);
    if (!b) continue;
    acc[b.key].rounds += 1;
    if (r.clear_round) acc[b.key].clears += 1;
  }
  return BANDS.map((b) => {
    const g = acc[b.key];
    return {
      label: b.label,
      rounds: g.rounds,
      clear: g.rounds ? (100 * g.clears) / g.rounds : null,
    };
  }).filter((g) => g.rounds > 0);
}

const lastOf = (d) => (d.history || [])[0]?.class_date || d.stats?.last_start || null;

function last5(history) {
  return (history || []).slice(0, 5).map((r) => ({
    clear: !!r.clear_round,
    faults: r.total_faults === null || r.total_faults === undefined ? null : Number(r.total_faults),
    place: r.finish_place ?? null,
    height: r.height_cm ?? null,
    event: r.event_name || '–',
    cls: r.class_name || '',
    date: r.class_date || null,
  }));
}

function lastOuting(history, now) {
  const r = (history || [])[0];
  if (!r) return null;
  return {
    clear: !!r.clear_round,
    faults: r.total_faults === null || r.total_faults === undefined ? null : Number(r.total_faults),
    place: r.finish_place ?? null,
    height: r.height_cm ?? null,
    event: r.event_name || '–',
    cls: r.class_name || '',
    when: fmtRel(r.class_date, now),
  };
}

export default async function Watchlist() {
  const now = Date.now();
  const token = cookies().get('eq_session')?.value;
  let watch = { data: [] };
  try {
    watch = await getPrivateJSON('/watchlist', token);
  } catch { watch = { data: [] }; }
  const items = watch.data || [];
  const horseItems = items.filter((w) => w.entity_type === 'horse');
  const riderItems = items.filter((w) => w.entity_type === 'rider');

  let updates = { data: [] };
  try {
    updates = await getPrivateJSON('/watchlist/updates?days=30&limit=100', token).catch(() => ({ data: [] }));
  } catch { /* shells */ }

  const needHorseIds = [...new Set(horseItems.map((w) => w.entity_id))];
  const hDetails = {};
  await Promise.all(needHorseIds.map(async (id) => {
    try { hDetails[id] = await getJSON(`/horses/${id}`); } catch { /* stale */ }
  }));
  const rDetails = {};
  await Promise.all(riderItems.map(async (w) => {
    try { rDetails[w.entity_id] = await getJSON(`/riders/${w.entity_id}`); } catch { /* stale */ }
  }));

  // season rank lists for Current Rank (latest season first)
  let events = { data: [] };
  try { events = await getJSON('/events?limit=100&has_data=1'); } catch { /* shell */ }
  const seasons = [...new Set(events.data.map((e) => e.season).filter(Boolean))].sort().reverse();
  const season = seasons[0] || '';
  let rankH = { data: [] }, rankR = { data: [] };
  try {
    [rankH, rankR] = await Promise.all([
      getJSON(`/rankings/horses?limit=200&min_starts=0${season ? `&season=${season}` : ''}`),
      getJSON(`/rankings/riders?limit=200&min_starts=0${season ? `&season=${season}` : ''}`),
    ]);
  } catch { /* shell */ }
  const byClear = (rows) => [...rows]
    .sort((a, b) => Number(b.clear_pct) - Number(a.clear_pct) || Number(b.starts) - Number(a.starts));
  const horseRank = {};
  byClear(rankH.data).forEach((x, i) => { horseRank[x.horse_id] = i + 1; });
  const riderRank = {};
  byClear(rankR.data).forEach((x, i) => { riderRank[x.rider_id] = i + 1; });

  const horses = horseItems
    .map((w) => {
      const d = hDetails[w.entity_id];
      if (!d) return null;
      const st = d.stats || {};
      const hist = d.history || [];
      const clear = Number(st.clear_pct) || 0;
      const [trend] = trendBadge(clear, hist.slice(0, 5));
      const p = (d.partnerships || [])[0] || null;
      return {
        kind: 'horse', watchId: w.id, id: w.entity_id, slug: w.slug || d.data?.slug,
        name: d.data?.name || w.name,
        clear, avg: Number(st.avg_faults) || 0, starts: Number(st.starts) || 0,
        wins: st.wins ?? 0, rank: horseRank[w.entity_id] ?? null, trend,
        last: fmtRel(lastOf(d), now),
        form: last5(hist),
        bands: heightBands(hist),
        outing: lastOuting(hist, now),
        partner: p ? {
          name: p.rider, id: p.rider_id,
          clear: Number(p.clear_pct) || 0, rounds: Number(p.rounds_together) || 0,
        } : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.clear - a.clear || b.starts - a.starts);

  const riders = riderItems
    .map((w) => {
      const d = rDetails[w.entity_id];
      if (!d) return null;
      const st = d.stats || {};
      const hist = d.history || [];
      const clear = Number(st.clear_pct) || 0;
      const [trend] = trendBadge(clear, hist.slice(0, 5));
      const p = (d.partnerships || [])[0] || null;
      return {
        kind: 'rider', watchId: w.id, id: w.entity_id, slug: w.slug || d.data?.slug,
        name: d.data?.name || w.name,
        clear, avg: Number(st.avg_faults) || 0, starts: Number(st.starts) || 0,
        wins: st.wins ?? 0, rank: riderRank[w.entity_id] ?? null, trend,
        last: fmtRel(lastOf(d), now),
        form: last5(hist),
        bands: heightBands(hist),
        outing: lastOuting(hist, now),
        partner: p ? {
          name: p.horse, id: p.horse_id,
          clear: Number(p.clear_pct) || 0, rounds: Number(p.rounds_together) || 0,
        } : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.clear - a.clear || b.starts - a.starts);

  // Feed: latest rounds from everything watched (past 30d), up to 12.
  const timeline = (updates.data || []).slice(0, 12).map((r) => ({
    horse: r.horse, rider: r.rider, horse_id: r.horse_id, rider_id: r.rider_id,
    entity: r.horse, event: r.event, cls: r.class_name, date: r.date,
    clear: !!r.clear, faults: r.faults === null ? null : Number(r.faults),
    place: r.place, when: fmtRel(r.date, now),
  }));

  // By-event grouping: every watched round (full histories, not just 30d)
  // bucketed per event so the stable's performance reads event by event.
  const byEventMap = {};
  const pushRound = (kind, who, r) => {
    const key = r.event_id || `name:${r.event_name || 'Unknown event'}`;
    const g = (byEventMap[key] ||= { event_id: r.event_id || null, event: r.event_name || 'Unknown event', date: null, entries: [] });
    if (r.class_date && (!g.date || r.class_date > g.date)) g.date = r.class_date;
    g.entries.push({
      kind, id: who.id, watchId: who.watchId, slug: who.slug, name: who.name,
      horse: r.horse, rider: r.rider, horse_id: r.horse_id, rider_id: r.rider_id,
      horse_slug: r.horse_slug, rider_slug: r.rider_slug,
      cls: r.class_name, date: r.class_date, event_name: r.event_name,
      height: r.height_cm, status: r.status || 'finished',
      clear: !!r.clear_round,
      faults: r.total_faults === null || r.total_faults === undefined ? null : Number(r.total_faults),
      jumpfaults: r.jump_faults === null || r.jump_faults === undefined ? null : Number(r.jump_faults),
      timefaults: r.time_faults === null || r.time_faults === undefined ? null : Number(r.time_faults),
      place: r.finish_place === null || r.finish_place === undefined ? null : Number(r.finish_place),
      points: r.points === null || r.points === undefined ? null : Number(r.points),
    });
  };
  for (const w of horseItems) {
    const d = hDetails[w.entity_id];
    if (!d) continue;
    const who = { id: w.entity_id, watchId: w.id, slug: w.slug || d.data?.slug, name: d.data?.name || w.name };
    for (const r of d.history || []) pushRound('horse', who, r);
  }
  for (const w of riderItems) {
    const d = rDetails[w.entity_id];
    if (!d) continue;
    const who = { id: w.entity_id, watchId: w.id, slug: w.slug || d.data?.slug, name: d.data?.name || w.name };
    for (const r of d.history || []) pushRound('rider', who, r);
  }
  const byEvent = Object.values(byEventMap)
    .map((g) => {
      const entries = g.entries.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      const clears = entries.filter((e) => e.clear).length;
      const withPlace = entries.filter((e) => e.place !== null);
      const best = withPlace.length ? Math.min(...withPlace.map((e) => e.place)) : null;
      const points = entries.reduce((s, e) => s + (Number(e.points) || 0), 0);
      const { event_id, event, date } = g;
      return { event_id, event, date, when: fmtDate(date), entries, clears, best, points };
    })
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  // Stable pulse: what actually happened in the last 30 days.
  const all = updates.data || [];
  const pulse = {
    rounds: all.length,
    clears: all.filter((r) => r.clear).length,
    podiums: all.filter((r) => r.place !== null && r.place !== undefined && Number(r.place) <= 3).length,
    wins: all.filter((r) => Number(r.place) === 1).length,
  };

  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h1 className={H1}>My Watchlist</h1>
          <p className={SUB}>Form and latest results for the horses and riders you follow. NZ National Circuit.</p>
        </div>
        <div className="flex gap-2 items-center shrink-0 pt-1.5">
          <span className={LIVE}>● LIVE MONITORED</span>
        </div>
      </div>

      {!horses.length && !riders.length ? (
        <section className={CARD}>
          <p className={SUB}>Your watchlist is empty — watch horses and riders to track them here.</p>
          <div className="flex gap-4">
            <Link href="/horses" className="text-sky no-underline hover:underline text-sm">Browse horses →</Link>
            <Link href="/riders" className="text-sky no-underline hover:underline text-sm">Browse riders →</Link>
          </div>
        </section>
      ) : (
        <WatchlistView
          horses={horses}
          riders={riders}
          timeline={timeline}
          pulse={pulse}
          byEvent={byEvent}
        />
      )}
    </>
  );
}
