import { getJSON } from '../lib/api';
import { CARD, H1, H2, LINK, LIVE, NUM, SUB, TABLE, TABLEWRAP, TD, TH } from '../lib/tokens';
import EventCarousel from '../components/EventCarousel';

export const dynamic = 'force-dynamic';

export default async function Landing() {
  const [horses, riders, events] = await Promise.all([
    getJSON('/rankings/horses?limit=200&metric=points').catch(() => ({ data: [] })),
    getJSON('/rankings/riders?limit=200&metric=points').catch(() => ({ data: [] })),
    getJSON('/events?limit=100').catch(() => ({ data: [] })),
  ]);
  const topH = (horses.data || []).slice(0, 5);
  const topR = (riders.data || []).slice(0, 5);
  const latest = [...(events.data || [])]
    .sort((a, b) => new Date(b.date_start || 0) - new Date(a.date_start || 0)).slice(0, 8);
  const totalRounds = (horses.data || []).reduce((s, h) => s + Number(h.starts || 0), 0);

  return (
    <>
      {/* HERO */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="max-w-[640px]">
          <span className={LIVE}>● LIVE CIRCUIT DATA</span>
          <h1 className="font-display text-[48px] md:text-[64px] font-bold uppercase tracking-tight leading-none mt-3">
            EQ<span className="text-gold">INDEX</span>
          </h1>
          <p className="text-muted text-[15px] md:text-base mt-2 tracking-wide">NEW ZEALAND SHOW JUMPING RANKINGS</p>
          <p className={SUB}>Placing-based points, clear-round intelligence, and form forecasts — from grassroots rounds to Grand Prix.</p>
          <div className="flex flex-wrap gap-2.5 mt-4">
            <a href="/rankings?by=points" className="bg-gold text-black font-bold rounded px-5 py-2.5 text-sm no-underline hover:brightness-110">VIEW RANKINGS →</a>
            <a href="/about" className="border border-line text-body rounded px-5 py-2.5 text-sm no-underline hover:border-gold/60">ABOUT THE SYSTEM →</a>
          </div>
        </div>
      </div>

      {/* LIVE STATS STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          ['Horses', String((horses.data || []).length)],
          ['Riders', String((riders.data || []).length)],
          ['Events', String((events.data || []).length)],
          ['Rounds', String(totalRounds)],
          ['Leader', topH[0]?.horse || '—'],
        ].map(([l, v]) => (
          <div key={l} className="bg-card border border-line rounded p-4">
            <div className="text-[11px] text-muted tracking-[0.4px] uppercase">{l}</div>
            <div className="text-[26px] font-extrabold mt-1 truncate" title={v}>{v}</div>
          </div>
        ))}
      </div>

      {/* TOP 5 LEADERS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <h2 className={H2}>Top Horses</h2>
          <section className={CARD}>
            <div className={TABLEWRAP}>
            <table className={TABLE}>
              <tbody>
                {topH.map((h, i) => (
                  <tr key={h.horse_id}>
                    <td className={i === 0 ? 'text-gold font-bold' : 'text-muted'}>#{i + 1}</td>
                    <td className={TD}><a href={`/horses/${h.horse_id}`} className="text-white font-semibold no-underline hover:text-gold">{h.horse}</a></td>
                    <td className={`${TD} ${NUM}`}><b className={i === 0 ? 'text-gold' : ''}>{h.total_points}</b> <span className="text-faint text-[11px]">pts</span></td>
                  </tr>
                ))}
                {!topH.length && <tr><td className={TD}>No data yet.</td></tr>}
              </tbody>
            </table>
            </div>
            <a href="/horses" className={`${LINK} text-[13px]`}>Full horse table →</a>
          </section>
        </div>
        <div>
          <h2 className={H2}>Top Riders</h2>
          <section className={CARD}>
            <div className={TABLEWRAP}>
            <table className={TABLE}>
              <tbody>
                {topR.map((r, i) => (
                  <tr key={r.rider_id}>
                    <td className={i === 0 ? 'text-gold font-bold' : 'text-muted'}>#{i + 1}</td>
                    <td className={TD}><a href={`/riders/${r.rider_id}`} className="text-white font-semibold no-underline hover:text-gold">{r.rider}</a></td>
                    <td className={`${TD} ${NUM}`}><b className={i === 0 ? 'text-gold' : ''}>{r.total_points}</b> <span className="text-faint text-[11px]">pts</span></td>
                  </tr>
                ))}
                {!topR.length && <tr><td className={TD}>No data yet.</td></tr>}
              </tbody>
            </table>
            </div>
            <a href="/riders" className={`${LINK} text-[13px]`}>Full rider table →</a>
          </section>
        </div>
      </div>

      {/* LATEST EVENTS */}
      <h2 className={H2}>Latest Events</h2>
      <p className={SUB}>Newest competitions on the circuit.</p>
      <EventCarousel events={latest} />

      {/* POINTS TEASER */}
      <section className={CARD}>
        <h2 className={H2}>How points work</h2>
        <p className="text-muted text-sm mt-1">12 / 9 / 7 / 6 / 5 / 4 / 3 / 2 / 1 / 1 for 1st–10th, multiplied by class grade — Grand Prix ×2.0, Premier ×1.5, Open ×1.25. <a href="/about" className={LINK}>Read full formula →</a></p>
      </section>

      {/* FEATURE GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {[
          ['Rankings', 'EQ + placing-points leaderboards with 12M/3M windows.', '/rankings?by=points'],
          ['Compare', 'Head-to-head matchup with win-edge prediction.', '/comparison'],
          ['Forecast', 'Form projections and next-class recommendations.', '/horses'],
          ['Watchlist', 'Track horses, riders and combinations live.', '/watchlist'],
          ['Series', 'Season points races with podium tracking.', '/series'],
          ['API', '41 documented endpoints for builders.', '/api-docs'],
        ].map(([t, d, href]) => (
          <a key={t} href={href} className="bg-card border border-line rounded p-4 no-underline hover:border-gold/60 group">
            <div className="font-bold text-white group-hover:text-gold">{t} →</div>
            <div className="text-[13px] text-muted mt-1">{d}</div>
          </a>
        ))}
      </div>
    </>
  );
}
