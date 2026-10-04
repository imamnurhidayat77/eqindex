import Link from 'next/link';
import { getJSON } from '../lib/api';
import { H2, LINK, SUB, badge, BADGE } from '../lib/tokens';
import EventCarousel from '../components/EventCarousel';
import HeroBanner from '../components/HeroBanner';

export const revalidate = 30;

export default async function Landing({ searchParams }) {
  const sp = searchParams || {};
  const showN = (Array.isArray(sp?.n) ? sp.n[0] : sp?.n) === '12' ? 12 : 10;
  const [horses, events, circuit, news] = await Promise.all([
    getJSON('/rankings/horses?limit=200&metric=points').catch(() => ({ data: [] })),
    getJSON('/events?limit=100&finished=1').catch(() => ({ data: [] })),
    getJSON('/trends/circuit').catch(() => ({ data: [] })),
    getJSON('/news/weekend?by=division').catch(() => ({ data: [], window: null, divisions: [] })),
  ]);
  const evs = (events.data || []).filter(
    (e) => Number(e.class_count || 0) > 0 || Number(e.round_count || 0) > 0 || Number(e.combo_count || 0) > 0
  );
  const latest = [...evs]
    .sort((a, b) => new Date(b.date_start || 0) - new Date(a.date_start || 0))
    .slice(0, showN);
  const totalRounds = (horses.data || []).reduce((s, h) => s + Number(h.starts || 0), 0);
  const months = (circuit.data || []).map((m) => m.month).filter(Boolean);
  const newsWin = news.window || null;
  const winLabel = newsWin && newsWin.d0 && newsWin.d1
    ? ` (${String(newsWin.d0).slice(0, 10)} → ${String(newsWin.d1).slice(0, 10)})` : '';

  return (
    <>
      {/* ============ HERO BANNER — show jumping ============ */}
      <HeroBanner />

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

      {months.length > 0 && (
        <p className="text-[11px] text-faint mb-2">Circuit coverage: {months[0]} → {months[months.length - 1]} · {totalRounds.toLocaleString()} rounds scored.</p>
      )}
    </>
  );
}
