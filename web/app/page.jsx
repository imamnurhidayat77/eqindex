import Link from 'next/link';
import { getJSON } from '../lib/api';
import { H2, LINK } from '../lib/tokens';
import EventCarousel from '../components/EventCarousel';

export const revalidate = 30;

export default async function Landing({ searchParams }) {
  const sp = searchParams || {};
  const showN = (Array.isArray(sp?.n) ? sp.n[0] : sp?.n) === '12' ? 12 : 10;
  const [events] = await Promise.all([
    getJSON('/events?limit=100&finished=1').catch(() => ({ data: [] })),
  ]);
  const evs = (events.data || []).filter(
    (e) => Number(e.class_count || 0) > 0 || Number(e.round_count || 0) > 0 || Number(e.combo_count || 0) > 0
  );
  const latest = [...evs]
    .sort((a, b) => new Date(b.date_start || 0) - new Date(a.date_start || 0))
    .slice(0, showN);

  return (
    <>
      {/* ============ LATEST RESULTS ============ */}
      <div className="flex items-baseline justify-between mb-4">
        <h2 className={H2}>Events</h2>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-faint">Show:</span>
          {[10, 12].map((n) => (
            <Link key={n} href={n === 10 ? '/' : '/?n=12'}
              className={`text-[12px] no-underline px-2 py-0.5 rounded ${showN === n ? 'bg-goldbg text-gold font-bold' : 'text-muted'}`}>{n}</Link>
          ))}
          <Link href="/events" className={`${LINK} text-[12px] ml-1`}>All events →</Link>
        </div>
      </div>
      <EventCarousel events={latest} />
    </>
  );
}
