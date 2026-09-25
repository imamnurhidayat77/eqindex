import { DEMO_USER, getJSON } from '../../lib/api';
import { CARD, H1, LINK, LIVE, SUB } from '../../lib/tokens';
import { eqScore, trendBadge } from '../../lib/eq';
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

export default async function Watchlist() {
  const now = Date.now();
  let watch = { data: [] };
  try {
    watch = DEMO_USER ? await getJSON(`/watchlist?user_id=${DEMO_USER}`) : { data: [] };
  } catch { watch = { data: [] }; }
  const items = watch.data || [];
  const horseItems = items.filter((w) => w.entity_type === 'horse');
  const riderItems = items.filter((w) => w.entity_type === 'rider');
  const comboItems = items.filter((w) => w.entity_type === 'combination');
  const eventItems = items.filter((w) => w.entity_type === 'event');

  let prefs = null, updates = { data: [] };
  try {
    [prefs, updates] = await Promise.all([
      DEMO_USER ? getJSON(`/alert-prefs?user_id=${DEMO_USER}`) : { data: null },
      DEMO_USER ? getJSON(`/watchlist/updates?user_id=${DEMO_USER}&days=30&limit=100`) : { data: [] },
    ]);
  } catch { /* shells */ }

  const needHorseIds = [...new Set([
    ...horseItems.map((w) => w.entity_id),
    ...comboItems.map((w) => w.horse_id).filter(Boolean),
  ])];

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
  try { events = await getJSON('/events?limit=100'); } catch { /* shell */ }
  const seasons = [...new Set(events.data.map((e) => e.season).filter(Boolean))].sort().reverse();
  const season = seasons[0] || '';
  let rankH = { data: [] }, rankR = { data: [] };
  try {
    [rankH, rankR] = await Promise.all([
      getJSON(`/rankings/horses?limit=200&min_starts=0${season ? `&season=${season}` : ''}`),
      getJSON(`/rankings/riders?limit=200&min_starts=0${season ? `&season=${season}` : ''}`),
    ]);
  } catch { /* shell */ }
  const withEq = (rows) => rows
    .map((x) => ({ ...x, eq: eqScore(x.clear_pct, x.avg_faults, x.starts) }))
    .sort((a, b) => b.eq - a.eq);
  const horseRank = {};
  withEq(rankH.data).forEach((x, i) => { horseRank[x.horse_id] = i + 1; });
  const riderRank = {};
  withEq(rankR.data).forEach((x, i) => { riderRank[x.rider_id] = i + 1; });

  const totalRounds = rankH.data.reduce((s, h) => s + Number(h.starts), 0);
  const totalClears = rankH.data.reduce((s, h) => s + Number(h.clears), 0);
  const circuitClear = totalRounds ? (100 * totalClears) / totalRounds : 0;

  const lastOf = (d) => (d.history || [])[0]?.class_date || d.stats?.last_start || null;

  const horses = horseItems
    .map((w) => {
      const d = hDetails[w.entity_id];
      if (!d) return null;
      const st = d.stats || {};
      const clear = Number(st.clear_pct) || 0;
      const avg = Number(st.avg_faults) || 0;
      const starts = Number(st.starts) || 0;
      const [trend] = trendBadge(clear, (d.history || []).slice(0, 5));
      const p = (d.partnerships || [])[0] || null;
      return {
        kind: 'horse', watchId: w.id, id: w.entity_id, isPublic: !!w.is_public, name: d.data?.name || w.name,
        eq: eqScore(clear, avg, starts), clear, avg, starts, wins: st.wins ?? 0,
        rank: horseRank[w.entity_id] ?? null, trend,
        last: fmtRel(lastOf(d), now),
        partner: p ? { name: p.rider, id: p.rider_id } : null,
        sd: st.faults_stddev === null || st.faults_stddev === undefined ? null : Number(st.faults_stddev),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.eq - a.eq);

  const riders = riderItems
    .map((w) => {
      const d = rDetails[w.entity_id];
      if (!d) return null;
      const st = d.stats || {};
      const clear = Number(st.clear_pct) || 0;
      const avg = Number(st.avg_faults) || 0;
      const starts = Number(st.starts) || 0;
      const [trend] = trendBadge(clear, (d.history || []).slice(0, 5));
      const p = (d.partnerships || [])[0] || null;
      return {
        kind: 'rider', watchId: w.id, id: w.entity_id, isPublic: !!w.is_public, name: d.data?.name || w.name,
        eq: eqScore(clear, avg, starts), clear, avg, starts, wins: st.wins ?? 0,
        rank: riderRank[w.entity_id] ?? null, trend,
        last: fmtRel(lastOf(d), now),
        partner: p ? { name: p.horse, id: p.horse_id } : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.eq - a.eq);

  // Watched combinations = explicit combo watches + top partnership of each
  // watched horse. Pair trend from the pair's own recent rounds.
  const combos = [];
  const comboWatch = {};
  for (const w of comboItems) comboWatch[`${w.horse_id}:${w.rider_id}`] = w;
  const comboRow = (horseId, horseName, p, watchItem) => {
    const d = hDetails[horseId];
    const pairHist = ((d?.history) || []).filter((r) => r.rider === p.rider);
    const pairClear = Number(p.clear_pct) || 0;
    const [trend] = trendBadge(pairClear, pairHist.slice(0, 5));
    return {
      key: `${horseId}:${p.rider_id}`, horse: horseName, horseId,
      rider: p.rider, riderId: p.rider_id,
      score: eqScore(p.clear_pct, p.avg_faults, p.rounds_together),
      rounds: Number(p.rounds_together), clear: pairClear,
      avg: Number(p.avg_faults), trend,
      watchId: watchItem ? watchItem.id : null,
      note: watchItem ? watchItem.note : null,
      isPublic: !!watchItem?.is_public,
    };
  };
  for (const h of horses) {
    const d = hDetails[h.id];
    const p = (d?.partnerships || [])[0];
    if (!p) continue;
    combos.push(comboRow(h.id, h.name, p, comboWatch[`${h.id}:${p.rider_id}`] || null));
  }
  for (const w of comboItems) {
    const key = `${w.horse_id}:${w.rider_id}`;
    if (combos.some((c) => c.key === key)) continue;
    const d = hDetails[w.horse_id];
    const p = (d?.partnerships || []).find((x) => x.rider_id === w.rider_id);
    if (!p) continue;
    combos.push(comboRow(w.horse_id, d.data?.name || w.name?.split(' × ')[0] || '–', p, w));
  }
  combos.sort((a, b) => b.score - a.score);

  // Events involving tracked entities + global recent timeline.
  const evMap = {};
  const allRounds = [];
  const pushHist = (hist, entity) => {
    for (const r of hist || []) {
      allRounds.push({
        entity, event: r.event_name || '–', cls: r.class_name || '',
        date: r.class_date || null, clear: !!r.clear_round,
        faults: r.total_faults === null ? null : Number(r.total_faults),
        place: r.finish_place ?? null,
      });
      const k = `${r.event_name}||${r.class_date}`;
      const g = (evMap[k] ||= { event: r.event_name || '–', date: r.class_date || null, rounds: 0, best: null });
      g.rounds += 1;
      if (r.finish_place !== null && r.finish_place !== undefined) {
        g.best = g.best === null ? r.finish_place : Math.min(g.best, r.finish_place);
      }
    }
  };
  for (const h of horses) pushHist(hDetails[h.id]?.history, h.name);
  for (const r of riders) pushHist(rDetails[r.id]?.history, r.name);
  const byDate = (a, b) => new Date(b.date || 0) - new Date(a.date || 0);
  // Timeline + recent count come from the watchlist updates endpoint (past 30d).
  const timeline = (updates.data || []).slice(0, 5).map((r) => ({
    entity: r.horse, event: r.event, cls: r.class_name, date: r.date,
    clear: !!r.clear, faults: r.faults === null ? null : Number(r.faults),
    place: r.place, when: fmtRel(r.date, now),
  }));
  const recentCount = (updates.data || []).length;
  // Merge explicitly watched events (resolve via events list) with derived ones.
  const evById = Object.fromEntries(events.data.map((e) => [e.id, e]));
  const evIdByName = {};
  for (const e of events.data) {
    const k = (e.name || '').trim().toLowerCase();
    if (k && !evIdByName[k]) evIdByName[k] = e.id;
  }
  const evRows = Object.values(evMap).map((e) => ({
    ...e, when: fmtRel(e.date, now),
    eventId: evIdByName[(e.event || '').trim().toLowerCase()] || null,
    watchId: null, isPublic: false,
  }));
  for (const w of eventItems) {
    const meta = evById[w.entity_id];
    if (evRows.some((e) => e.eventId === w.entity_id)) {
      evRows.find((e) => e.eventId === w.entity_id).watchId ||= w.id;
      continue;
    }
    evRows.push({
      event: meta?.name || w.name || '–', date: meta?.date_start || null,
      when: fmtRel(meta?.date_start, now), rounds: 0, best: null,
      eventId: w.entity_id, watchId: w.id, isPublic: !!w.is_public,
    });
  }
  const eventsTop = evRows.sort(byDate).slice(0, 8);

  // Watchlist Intelligence — derived from tracked data, no fabrication.
  const insights = [];
  if (horses.length) {
    const top = [...horses].sort((a, b) => b.clear - a.clear)[0];
    insights.push(`${top.name} has the highest clear rate among all tracked horses at ${Number(top.clear).toFixed(1)}% over ${top.starts} rounds.`);
    const above = horses.filter((h) => h.clear > circuitClear).length;
    if (above) {
      const lead = [...horses].sort((a, b) => b.clear - a.clear)[0];
      insights.push(`${lead.name} is performing above circuit benchmark — ${Number(lead.clear).toFixed(1)}% vs ${circuitClear.toFixed(1)}% circuit average across ${horses.length} tracked ${horses.length === 1 ? 'horse' : 'horses'}.`);
    } else {
      insights.push(`Tracked horses clear ${circuitClear.toFixed(1)}% on average against the circuit — no horse currently above benchmark.`);
    }
  }
  if (combos.length) {
    const top = [...combos].sort((a, b) => b.clear - a.clear)[0];
    insights.push(`The ${top.horse} × ${top.rider} partnership has the highest clear rate among all tracked combinations at ${Number(top.clear).toFixed(1)}%.`);
  }
  while (insights.length < 3) insights.push('Watch more horses and riders to unlock further stable intelligence.');

  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h1 className={H1}>My Watchlist</h1>
          <p className={SUB}>Track horses, riders and combinations you want to follow. NZ National Circuit.</p>
        </div>
        <div className="flex gap-2 items-center shrink-0 pt-1.5">
          <span className={LIVE}>● LIVE MONITORED</span>
        </div>
      </div>

      {!horses.length && !riders.length ? (
        <section className={CARD}>
          <p className={SUB}>Your watchlist is empty — watch horses and riders to track them here.</p>
          <div className="flex gap-4">
            <a href="/horses" className="text-sky no-underline hover:underline text-sm">Browse horses →</a>
            <a href="/riders" className="text-sky no-underline hover:underline text-sm">Browse riders →</a>
          </div>
        </section>
      ) : (
        <WatchlistView
          horses={horses}
          riders={riders}
          combos={combos}
          eventsTop={eventsTop}
          timeline={timeline}
          insights={insights.slice(0, 3)}
          recentCount={recentCount}
          initialPrefs={prefs?.data || null}
        />
      )}
    </>
  );
}
