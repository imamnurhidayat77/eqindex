import Link from 'next/link';
import { getJSON } from '../../lib/api';
import { CARD, H1, H2, SUB, LINK, badge, BADGE } from '../../lib/tokens';
import { StatCard, StatGrid } from '../../components/StatCard';

export const revalidate = 30;

export default async function About() {
  const [horses, riders, events, classes, stats] = await Promise.all([
    getJSON('/rankings/horses?limit=500').catch(() => ({ data: [] })),
    getJSON('/rankings/riders?limit=500').catch(() => ({ data: [] })),
    getJSON('/events?limit=100&has_data=1').catch(() => ({ data: [] })),
    getJSON('/classes?limit=500').catch(() => ({ data: [] })),
    // Exact totals (leaderboard lists are paging-capped — never count from them).
    getJSON('/stats/circuit').catch(() => null),
  ]);
  const t = stats?.data || null;
  const nH = t?.horses ?? (horses.data || []).length, nR = t?.riders ?? (riders.data || []).length;
  const nE = t?.events ?? (events.data || []).length, nC = t?.classes ?? (classes.data || []).length;
  const rounds = t?.rounds ?? (horses.data || []).reduce((s, h) => s + Number(h.starts || 0), 0);
  const seasons = [...new Set((events.data || []).map((e) => e.season).filter(Boolean))].sort();

  return (
    <>
      <div className="mb-1 text-[12px] text-faint">EQINDEX <span className="text-gold">/</span> ABOUT</div>
      <h1 className={H1}>About EQIndex</h1>
      <p className={SUB}>New Zealand show jumping results, rankings and records.</p>

      {/* hero stats */}
      <StatGrid cols={5}>
        {[['Horses', nH], ['Riders', nR], ['Events', nE], ['Classes', nC], ['Rounds', rounds]].map(([l, v]) => (
          <StatCard key={l} label={l} value={Number(v).toLocaleString()} />
        ))}
      </StatGrid>

      <section className={CARD}>
        <h2 className={H2}>Mission</h2>
        <p className="text-[15px] leading-relaxed">Equestrian results in New Zealand live scattered across organiser files, timing systems and Facebook posts.
        EQIndex unifies them into one trusted record of who won, who placed, and where — for riders, owners, coaches, breeders and selectors.</p>
        <p className="text-muted text-sm mt-2">Coverage today: <b className="text-body">{seasons.map((s) => s.replace('-', '/')).join(' · ') || '—'}</b> · {rounds.toLocaleString()} rounds scored.</p>
      </section>

      <section className={CARD}>
        <h2 className={H2}>Labels you will see</h2>
        <div className="flex flex-wrap gap-2 mt-2">
          <span className={badge(BADGE.blue)}>Independent</span><span className="text-muted text-sm">Compiled by EQIndex (series, forecasts, benchmarks).</span>
        </div>
      </section>

      <section className={CARD}>
        <h2 className={H2}>Naming & corrections</h2>
        <p className="text-muted text-sm">“Kiwi-Spirit” vs “Kiwi Spirit” vs “KIWI SPIRIT” are one horse. Spot an error? <Link className={LINK} href="/contact">Report a correction →</Link></p>
      </section>

      <section className={CARD}>
        <h2 className={H2}>Limits & fair use</h2>
        <p className="text-muted text-sm">Rankings reflect recorded results only; unrecorded schooling rounds don't exist here. Bulk reuse of the database requires written permission (see <Link className={LINK} href="/terms">Terms →</Link>). Programmatic access: <Link className={LINK} href="/contact">Contact →</Link></p>
      </section>

      <section className={CARD}>
        <h2 className={H2}>Glossary</h2>
        <p className="text-muted text-sm">Terms, height bands and class definitions: <Link className={LINK} href="/glossary">Glossary →</Link></p>
      </section>
    </>
  );
}
