import Link from 'next/link';
import { getJSON } from '../lib/api';
import { CARD, H2, LINK, LIVE, SUB, badge, BADGE } from '../lib/tokens';
import EventCarousel from '../components/EventCarousel';
import { StatCard, StatGrid } from '../components/StatCard';

export const revalidate = 30;

export default async function Landing({ searchParams }) {
  const sp = searchParams || {};
  const showN = (Array.isArray(sp?.n) ? sp.n[0] : sp?.n) === '12' ? 12 : 10;
  const [horses, riders, events, upcomingEv, series, circuit, classes, news, stats] = await Promise.all([
    getJSON('/rankings/horses?limit=200&metric=points').catch(() => ({ data: [] })),
    getJSON('/rankings/riders?limit=200&metric=points').catch(() => ({ data: [] })),
    getJSON('/events?limit=100&finished=1').catch(() => ({ data: [] })),
    getJSON('/events?limit=20&upcoming=1').catch(() => ({ data: [] })),
    getJSON('/series').catch(() => ({ data: [] })),
    getJSON('/trends/circuit').catch(() => ({ data: [] })),
    getJSON('/classes?limit=200').catch(() => ({ data: [] })),
    getJSON('/news/weekend?by=division').catch(() => ({ data: [], window: null, divisions: [] })),
    getJSON('/stats/circuit').catch(() => null),
  ]);
  const topH = (horses.data || []).slice(0, 5);
  const topR = (riders.data || []).slice(0, 5);
  const evs = (events.data || []).filter(
    (e) => Number(e.class_count || 0) > 0 || Number(e.round_count || 0) > 0 || Number(e.combo_count || 0) > 0
  );
  // per-event result status from its classes: all official → Official,
  // any provisional → Provisional, else Complete.
  const byEvent = {};
  for (const c of classes.data || []) {
    const st = c.result_status || 'provisional';
    const cur = byEvent[c.event];
    byEvent[c.event] = cur === 'provisional' || st === 'provisional' ? 'provisional'
      : cur === undefined ? st : cur === 'official' && st === 'official' ? 'official' : 'complete';
  }
  const latest = [...evs]
    .sort((a, b) => new Date(b.date_start || 0) - new Date(a.date_start || 0))
    .slice(0, showN)
    .map((e) => ({ ...e, status: byEvent[e.name] || null }));
  // Fixtures not yet started (soonest first) — no results yet.
  const upcoming = [...(upcomingEv.data || [])]
    .sort((a, b) => new Date(a.date_start || 0) - new Date(b.date_start || 0))
    .slice(0, 8);
  const totalRounds = (horses.data || []).reduce((s, h) => s + Number(h.starts || 0), 0);
  const leader = topH[0] || null;
  const leadRider = topR[0] || null;
  const lastEvent = latest[0] || null;
  // Exact circuit totals when the API serves them; otherwise the capped lists.
  const t = stats?.data || null;
  const nH = t?.horses ?? (horses.data || []).length;
  const nR = t?.riders ?? (riders.data || []).length;
  const nRounds = t?.rounds ?? totalRounds;
  const nE = t?.events ?? evs.length;
  const nC = t?.classes ?? (classes.data || []).length;
  const months = (circuit.data || []).map((m) => m.month).filter(Boolean);
  const seasonLabel = (() => {
    const ss = [...new Set(evs.map((e) => e.season).filter(Boolean))].sort().reverse();
    return (ss[0] || '').replace('-', '/') || '2026/27';
  })();
  const newsWin = news.window || null;
  const winLabel = newsWin && newsWin.d0 && newsWin.d1
    ? ` (${String(newsWin.d0).slice(0, 10)} → ${String(newsWin.d1).slice(0, 10)})` : '';

  return (
    <>
      {/* ============ HERO — circuit statistics ============ */}
      <section className="rounded border border-line bg-card mb-6 p-6 md:p-8">
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <span className={LIVE}>● LIVE CIRCUIT DATA</span>
          <span className="text-[11px] font-bold text-faint border border-line rounded-full px-2.5 py-1">SEASON {seasonLabel}</span>
        </div>
        <StatGrid cols={6}>
          <StatCard label="Horses" value={Number(nH).toLocaleString()} />
          <StatCard label="Riders" value={Number(nR).toLocaleString()} />
          <StatCard label="Rounds" value={Number(nRounds).toLocaleString()} />
          <StatCard label="Events" value={Number(nE).toLocaleString()} />
          <StatCard label="Classes" value={Number(nC).toLocaleString()} />
          <StatCard
            label="Points leader"
            value={leader ? String(leader.total_points) : '—'}
            sub={leader ? `${leader.horse}${leadRider ? ` · ${leadRider.rider}` : ''}` : null}
            subTone="gold"
            title={leader ? `${leader.horse} — ${leader.total_points} pts` : undefined}
          />
        </StatGrid>
        {(lastEvent || leadRider) && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] text-muted">
            {lastEvent && <span>Latest event: <Link href={`/events/${lastEvent.slug || lastEvent.id}`} className="text-white font-semibold no-underline hover:text-gold">{lastEvent.name}</Link> <span className="text-faint">{(lastEvent.date_start || '').slice(0, 10)}</span></span>}
            {leadRider && <span>Top rider: <Link href={`/riders/${leadRider.rider_slug || leadRider.rider_id}`} className="text-white font-semibold no-underline hover:text-gold">{leadRider.rider}</Link> <b className="text-gold">{leadRider.total_points}</b> pts</span>}
          </div>
        )}
      </section>

      {/* ============ LATEST RESULTS ============ */}
      <div className="flex items-baseline justify-between">
        <h2 className={H2}>Latest Results</h2>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-faint">Show:</span>
          {[10, 12].map((n) => (
            <Link key={n} href={n === 10 ? '/' : '/?n=12'}
              className={`text-[12px] no-underline px-2 py-0.5 rounded ${showN === n ? 'bg-goldbg text-gold font-bold' : 'text-muted'}`}>{n}</Link>
          ))}
          <Link href="/events" className={`${LINK} text-[12px] ml-1`}>All events →</Link>
        </div>
      </div>
      <p className={SUB}>Finished competitions with published results — every booking engine in one place.</p>
      <EventCarousel events={latest} />

      {/* ============ WEEKEND BEST (NEWS) ============ */}
      <div className="flex items-baseline justify-between">
        <h2 className={H2}>Weekend Best</h2>
        <Link href="/events" className={`${LINK} text-[12px] ml-1`}>All results →</Link>
      </div>
      <p className={SUB}>Top performances of the latest results weekend{winLabel} — by division. Click through to the event.</p>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
        {(news.divisions || []).map((d) => {
          const w = (news.data || []).find((x) => x.key === d.key);
          if (!w) {
            return (
              <div key={d.key} className="rounded border border-line bg-card p-4 opacity-60">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-faint">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: d.color || '#888' }} />{d.label}
                </div>
                <p className="text-[13px] text-muted mt-2">No {d.label.toLowerCase()} results this weekend.</p>
              </div>
            );
          }
          const placed = Number(w.finish_place);
          const placeTxt = placed >= 1 ? (placed === 1 ? 'Winner' : `#${placed}`) : 'Top mark';
          return (
            <Link key={d.key} href={`/events/${w.event_slug || w.event_id}`}
              className="rounded border border-gold/40 bg-card p-4 no-underline hover:border-gold/70 transition-colors group block">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gold">
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: d.color || w.color || '#888' }} />{w.title}
              </div>
              <div className="mt-1.5 text-[15px] font-extrabold text-white group-hover:text-gold leading-tight">{w.rider}</div>
              <div className="text-[13px] text-muted leading-snug">{w.horse}</div>
              <div className="mt-2"><span className={badge(BADGE.green)}>{placeTxt} · {(Number(w.height_cm) / 100).toFixed(2)}m</span></div>
              <div className="mt-1.5 text-[12px] text-faint truncate" title={w.event_name}>{w.event_name}</div>
            </Link>
          );
        })}
      </div>

      {/* ============ UPCOMING EVENTS ============ */}
      <div className="flex items-baseline justify-between">
        <h2 className={H2}>Upcoming Events</h2>
        <Link href="/events" className={`${LINK} text-[12px] ml-1`}>Full calendar →</Link>
      </div>
      <p className={SUB}>Fixtures on the calendar — results appear here once published.</p>
      <EventCarousel events={upcoming} kind="upcoming" />

      {months.length > 0 && (
        <p className="text-[11px] text-faint mb-2">Circuit coverage: {months[0]} → {months[months.length - 1]} · {totalRounds.toLocaleString()} rounds scored.</p>
      )}
    </>
  );
}
