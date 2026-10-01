import Link from 'next/link';
import { getJSON } from '../lib/api';
import { CARD, H2, LINK, LIVE, NUM, SUB, TABLE, TABLEWRAP, TD, TH, badge, BADGE } from '../lib/tokens';
import EventCarousel from '../components/EventCarousel';
import { TableEmpty } from '../components/EmptyState';

export const revalidate = 30;

const CATS = ['Pro', 'Young Rider', 'Junior', 'Amateur', 'Pony'];
const catTitle = (c) => (c === 'Pro' ? 'Best Pro Rider' : c === 'Amateur' ? 'Best Amateur' : `Best ${c} Rider`);

export default async function Landing({ searchParams }) {
  const sp = searchParams || {};
  const showN = (Array.isArray(sp?.n) ? sp.n[0] : sp?.n) === '12' ? 12 : 10;
  const [horses, riders, events, upcomingEv, series, circuit, classes, eiH, eiR, news] = await Promise.all([
    getJSON('/rankings/horses?limit=200&metric=points').catch(() => ({ data: [] })),
    getJSON('/rankings/riders?limit=200&metric=points').catch(() => ({ data: [] })),
    getJSON('/events?limit=100&finished=1').catch(() => ({ data: [] })),
    getJSON('/events?limit=20&upcoming=1').catch(() => ({ data: [] })),
    getJSON('/series').catch(() => ({ data: [] })),
    getJSON('/trends/circuit').catch(() => ({ data: [] })),
    getJSON('/classes?limit=200').catch(() => ({ data: [] })),
    getJSON('/rankings/horses?limit=1&metric=eqindex').catch(() => ({ data: [] })),
    getJSON('/rankings/riders?limit=1&metric=eqindex').catch(() => ({ data: [] })),
    getJSON('/news/weekend').catch(() => ({ data: [], window: null })),
  ]);
  const topH = (horses.data || []).slice(0, 5);
  const topR = (riders.data || []).slice(0, 5);
  const topRatedH = (eiH.data || [])[0] || null;
  const topRatedR = (eiR.data || [])[0] || null;
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
      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden rounded border border-line bg-card mb-6">
        <div className="pointer-events-none absolute -top-24 -right-24 w-[380px] h-[380px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(232,180,74,0.14), transparent 65%)' }} />
        <div className="pointer-events-none absolute -bottom-32 -left-16 w-[300px] h-[300px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(76,154,255,0.10), transparent 65%)' }} />
        <div className="relative grid gap-6 lg:grid-cols-[1.5fr_1fr] p-6 md:p-10">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={LIVE}>● LIVE CIRCUIT DATA</span>
              <span className="text-[11px] font-bold text-faint border border-line rounded-full px-2.5 py-1">SEASON {seasonLabel}</span>
            </div>
            <h1 className="font-display text-[52px] md:text-[76px] font-bold uppercase tracking-tight leading-[0.95] mt-4">
              EQ<span className="text-gold">INDEX</span>
            </h1>
            <p className="text-body text-[15px] md:text-[17px] font-semibold tracking-[0.18em] mt-2">NEW ZEALAND SHOW JUMPING RANKINGS</p>
            <p className="text-muted text-sm md:text-[15px] mt-3 max-w-[560px] leading-relaxed">
              Every round scored by an open placing-points formula, enriched with clear-round
              intelligence, form forecasts and head-to-head comparison — from grassroots
              rounds to Grand Prix.
            </p>
            <div className="flex flex-wrap gap-2.5 mt-5">
              <Link href="/rankings?by=points" className="bg-gold text-black font-bold rounded px-6 py-3 text-sm no-underline hover:brightness-110">VIEW RANKINGS →</Link>
              <Link href="/comparison" className="border border-line text-body rounded px-6 py-3 text-sm no-underline hover:border-gold/60">COMPARE HORSES →</Link>
              <Link href="/about" className="text-muted text-sm no-underline hover:text-white self-center ml-1">How scoring works</Link>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1.5 mt-6 text-[12.5px] text-muted">
              <span><b className="text-gold">{(horses.data || []).length}</b> horses ranked</span>
              <span><b className="text-gold">{(riders.data || []).length}</b> riders ranked</span>
              <span><b className="text-gold">{totalRounds.toLocaleString()}</b> rounds analysed</span>
              <span><b className="text-gold">{(series.data || []).length}</b> series tracked</span>
            </div>
          </div>
          {/* leader spotlight */}
          <div className="rounded border border-gold/40 bg-ink/60 p-5 self-start w-full">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wide text-faint">Circuit points leader</span>
              <span className={badge(BADGE.goldfill)}>#{1} NATIONAL</span>
            </div>
            {leader ? (
              <>
                <Link href={`/horses/${leader.horse_slug || leader.horse_id}`} className="block mt-2 text-[24px] font-extrabold text-white no-underline hover:text-gold leading-tight">{leader.horse}</Link>
                <div className="mt-1 text-[13px] text-muted">
                  <b className="text-gold text-[26px] font-extrabold">{leader.total_points}</b> pts · {leader.wins} wins · {Number(leader.clear_pct).toFixed(0)}% clear
                </div>
                <div className="mt-3 pt-3 border-t border-line/60 text-[13px]">
                  <div className="text-[11px] uppercase tracking-wide text-faint font-bold mb-1">Top rider</div>
                  {leadRider ? (
                    <Link href={`/riders/${leadRider.rider_slug || leadRider.rider_id}`} className="text-white font-bold no-underline hover:text-gold">{leadRider.rider}</Link>
                  ) : <span className="text-faint">—</span>}
                  {leadRider && <span className="text-muted"> · <b className="text-gold">{leadRider.total_points}</b> pts</span>}
                </div>
                <div className="mt-3 pt-3 border-t border-line/60 text-[13px]">
                  <div className="text-[11px] uppercase tracking-wide text-faint font-bold mb-1">Top rated (EQIndex Rating)</div>
                  {topRatedH ? (
                    <Link href="/rankings" className="text-white font-bold no-underline hover:text-gold">{topRatedH.horse}</Link>
                  ) : <span className="text-faint">—</span>}
                  {topRatedH && <span className="text-muted"> · <b className="text-gold">{topRatedH.rating}</b></span>}
                  {topRatedR && <div className="mt-1"><Link href="/rankings" className="text-white font-semibold no-underline hover:text-gold">{topRatedR.rider}</Link><span className="text-muted"> · <b className="text-gold">{topRatedR.rating}</b></span></div>}
                </div>
                <div className="mt-3 pt-3 border-t border-line/60 text-[13px]">
                  <div className="text-[11px] uppercase tracking-wide text-faint font-bold mb-1">Latest event</div>
                  {lastEvent ? (
                    <Link href={`/events/${lastEvent.slug || lastEvent.id}`} className="text-white font-semibold no-underline hover:text-gold">{lastEvent.name}</Link>
                  ) : <span className="text-faint">—</span>}
                  {lastEvent && <div className="text-muted text-[12px] mt-0.5">{(lastEvent.date_start || '').slice(0, 10)} · {lastEvent.venue}</div>}
                </div>
              </>
            ) : <p className="text-muted text-sm mt-3">No rankings published yet.</p>}
          </div>
        </div>
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
      <p className={SUB}>Top performances of the latest results weekend{winLabel} — by rider category. Click through to the event.</p>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
        {CATS.map((cat) => {
          const w = (news.data || []).find((x) => x.cat === cat);
          if (!w) {
            return (
              <div key={cat} className="rounded border border-line bg-card p-4 opacity-60">
                <div className="text-[11px] font-bold uppercase tracking-wide text-faint">{catTitle(cat)}</div>
                <p className="text-[13px] text-muted mt-2">No {cat.toLowerCase()} results this weekend.</p>
              </div>
            );
          }
          const placed = Number(w.finish_place);
          const placeTxt = placed >= 1 ? (placed === 1 ? 'Winner' : `#${placed}`) : 'Top mark';
          return (
            <Link key={cat} href={`/events/${w.event_slug || w.event_id}`}
              className="rounded border border-gold/40 bg-card p-4 no-underline hover:border-gold/70 transition-colors group block">
              <div className="text-[11px] font-bold uppercase tracking-wide text-gold">{catTitle(cat)}</div>
              <div className="mt-1.5 text-[15px] font-extrabold text-white group-hover:text-gold leading-tight">{w.rider}</div>
              <div className="text-[13px] text-muted leading-snug">{w.horse}</div>
              <div className="mt-2"><span className={badge(BADGE.green)}>{placeTxt} · {(Number(w.height_cm) / 100).toFixed(2)}m</span></div>
              <div className="mt-1.5 text-[12px] text-faint truncate" title={w.event_name}>{w.event_name}</div>
            </Link>
          );
        })}
      </div>

      {/* ============ HOW IT WORKS ============ */}
      <div className="grid gap-3 md:grid-cols-3 mb-6">
        {[
          ['01 · Results in', 'Organiser CSVs, ESNZ series and official exports — deduplicated, normalised, human-reviewed.'],
          ['02 · Points calculated', '12/9/7/6/5/4/3/2/1/1 × class multiplier. Deterministic, auditable, same for everyone.'],
          ['03 · Intelligence out', 'Rankings, forecasts, comparisons and watchlists — all derived, nothing fabricated.'],
        ].map(([t, d]) => (
          <div key={t} className="rounded border border-line bg-card p-4">
            <div className="font-display text-[15px] font-bold uppercase tracking-wide text-gold">{t}</div>
            <p className="text-[13px] text-muted mt-1.5 leading-relaxed">{d}</p>
          </div>
        ))}
      </div>

      {/* ============ LEADERS ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <div className="flex items-baseline justify-between">
            <h2 className={H2}>Top Horses on Points</h2>
            <Link href="/horses" className={`${LINK} text-[12px]`}>Full table →</Link>
          </div>
          <section className={CARD}>
            <div className={TABLEWRAP}>
            <table className={TABLE}>
              <thead><tr><th className={TH}>#</th><th className={TH}>Horse</th><th className={`${TH} ${NUM}`}>Points</th><th className={`${TH} ${NUM}`}>Wins</th><th className={`${TH} ${NUM}`}>Clear %</th></tr></thead>
              <tbody>
                {topH.map((h, i) => (
                  <tr key={h.horse_id}>
                    <td className={i === 0 ? 'text-gold font-bold' : 'text-muted'}>#{i + 1}</td>
                    <td className={TD}><Link href={`/horses/${h.horse_slug || h.horse_id}`} className="text-white font-semibold no-underline hover:text-gold">{h.horse}</Link></td>
                    <td className={`${TD} ${NUM}`}><b className={i === 0 ? 'text-gold' : ''}>{h.total_points}</b></td>
                    <td className={`${TD} ${NUM} text-muted`}>{h.wins}</td>
                    <td className={`${TD} ${NUM} text-moss`}>{Number(h.clear_pct).toFixed(0)}%</td>
                  </tr>
                ))}
                {!topH.length && (
                  <TableEmpty icon="🐎" title="Leaderboard updating" hint="Rankings refresh as new results are imported." />
                )}
              </tbody>
            </table>
            </div>
          </section>
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <h2 className={H2}>Top Riders on Points</h2>
            <Link href="/riders" className={`${LINK} text-[12px]`}>Full table →</Link>
          </div>
          <section className={CARD}>
            <div className={TABLEWRAP}>
            <table className={TABLE}>
              <thead><tr><th className={TH}>#</th><th className={TH}>Rider</th><th className={`${TH} ${NUM}`}>Points</th><th className={`${TH} ${NUM}`}>Wins</th><th className={`${TH} ${NUM}`}>Clear %</th></tr></thead>
              <tbody>
                {topR.map((r, i) => (
                  <tr key={r.rider_id}>
                    <td className={i === 0 ? 'text-gold font-bold' : 'text-muted'}>#{i + 1}</td>
                    <td className={TD}><Link href={`/riders/${r.rider_slug || r.rider_id}`} className="text-white font-semibold no-underline hover:text-gold">{r.rider}</Link></td>
                    <td className={`${TD} ${NUM}`}><b className={i === 0 ? 'text-gold' : ''}>{r.total_points}</b></td>
                    <td className={`${TD} ${NUM} text-muted`}>{r.wins}</td>
                    <td className={`${TD} ${NUM} text-moss`}>{Number(r.clear_pct).toFixed(0)}%</td>
                  </tr>
                ))}
                {!topR.length && (
                  <TableEmpty icon="🏇" title="Leaderboard updating" hint="Rankings refresh as new results are imported." />
                )}
              </tbody>
            </table>
            </div>
          </section>
        </div>
      </div>

      {/* ============ UPCOMING EVENTS ============ */}
      <div className="flex items-baseline justify-between">
        <h2 className={H2}>Upcoming Events</h2>
        <Link href="/events" className={`${LINK} text-[12px] ml-1`}>Full calendar →</Link>
      </div>
      <p className={SUB}>Fixtures on the calendar — results appear here once published.</p>
      <EventCarousel events={upcoming} kind="upcoming" />

      {/* ============ TRUST + CTA ============ */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className={CARD}>
          <h2 className={H2}>How points work</h2>
          <p className="text-muted text-sm mt-1">12 / 9 / 7 / 6 / 5 / 4 / 3 / 2 / 1 / 1 for 1st–10th, multiplied by class grade — Grand Prix ×2.0, Premier ×1.5, Open ×1.25.</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-[12.5px] text-muted">
            <span>✓ Published formula</span><span>✓ Human-reviewed names</span><span>✓ Provisional vs Official labels</span>
          </div>
          <div className="mt-3"><Link href="/about" className={LINK}>Read full methodology →</Link></div>
        </section>
        <section className="rounded border border-gold/50 bg-card p-5 mb-6">
          <h2 className="font-display text-[20px] font-bold uppercase tracking-tight">Follow the circuit <span className="text-gold">live</span></h2>
          <p className="text-muted text-sm mt-1 mb-4">Watchlists, saved comparisons and ranking alerts — free for supporters.</p>
          <div className="flex flex-wrap gap-2.5">
            <Link href="/register" className="bg-gold text-black font-bold rounded px-5 py-2.5 text-sm no-underline hover:brightness-110">CREATE FREE ACCOUNT →</Link>
            <Link href="/watchlist" className="border border-line text-body rounded px-5 py-2.5 text-sm no-underline hover:border-gold/60">EXPLORE WATCHLIST →</Link>
          </div>
        </section>
      </div>

      {/* ============ FEATURE GRID ============ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {[
          ['Rankings', 'EQ + placing-points leaderboards with 12M/3M windows.', '/rankings?by=points'],
          ['Compare', 'Head-to-head matchup with win-edge prediction.', '/comparison'],
          ['Forecast', 'Form projections and next-class recommendations.', '/horses'],
          ['Watchlist', 'Track horses, riders and combinations live.', '/watchlist'],
          ['Series', 'Season points races with podium tracking.', '/series'],
          ['Events', 'Follow every show on the circuit.', '/events'],
        ].map(([t, d, href]) => (
          <Link key={t} href={href} className="bg-card border border-line rounded p-4 no-underline hover:border-gold/60 group">
            <div className="font-bold text-white group-hover:text-gold">{t} →</div>
            <div className="text-[13px] text-muted mt-1">{d}</div>
          </Link>
        ))}
      </div>
      {months.length > 0 && (
        <p className="text-[11px] text-faint mb-2">Circuit coverage: {months[0]} → {months[months.length - 1]} · {totalRounds.toLocaleString()} rounds scored.</p>
      )}
    </>
  );
}
