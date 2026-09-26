import { getJSON } from '../../lib/api';
import { CARD, H1, H2, H3, SUB, TABLE, TABLEWRAP, TD, TH, NUM, LINK, badge, BADGE } from '../../lib/tokens';

export const dynamic = 'force-dynamic';

export default async function About() {
  const [horses, riders, events, classes] = await Promise.all([
    getJSON('/rankings/horses?limit=500').catch(() => ({ data: [] })),
    getJSON('/rankings/riders?limit=500').catch(() => ({ data: [] })),
    getJSON('/events?limit=100').catch(() => ({ data: [] })),
    getJSON('/classes?limit=500').catch(() => ({ data: [] })),
  ]);
  const nH = (horses.data || []).length, nR = (riders.data || []).length;
  const nE = (events.data || []).length, nC = (classes.data || []).length;
  const rounds = (horses.data || []).reduce((s, h) => s + Number(h.starts || 0), 0);
  const seasons = [...new Set((events.data || []).map((e) => e.season).filter(Boolean))].sort();

  return (
    <>
      <div className="mb-1 text-[12px] text-faint">EQINDEX <span className="text-gold">/</span> ABOUT & METHODOLOGY</div>
      <h1 className={H1}>About EQIndex</h1>
      <p className={SUB}>The evidence engine for New Zealand show jumping — every number traceable to a round.</p>

      {/* hero stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[['Horses', nH], ['Riders', nR], ['Events', nE], ['Classes', nC], ['Rounds', rounds]].map(([l, v]) => (
          <div key={l} className="bg-card border border-line rounded p-4">
            <div className="text-[11px] text-muted tracking-[0.4px] uppercase">{l}</div>
            <div className="text-[26px] font-extrabold mt-1">{Number(v).toLocaleString()}</div>
          </div>
        ))}
      </div>

      <section className={CARD}>
        <h2 className={H2}>Mission</h2>
        <p className="text-[15px] leading-relaxed">Equestrian results in New Zealand live scattered across organiser files, timing systems and Facebook posts.
        EQIndex unifies them into one trusted record and turns them into intelligence riders, owners, coaches, breeders and selectors can act on:
        who is genuinely best, who is improving, which partnerships click, and where performance happens.</p>
        <p className="text-muted text-sm mt-2">Coverage today: <b className="text-body">{seasons.map((s) => s.replace('-', '/')).join(' · ') || '—'}</b> · {rounds.toLocaleString()} rounds scored.</p>
      </section>

      <section className={CARD}>
        <h2 className={H2}>Where data comes from</h2>
        <p className="text-muted text-sm mb-3">Four channels, one pipeline. Nothing is scraped against a source's terms.</p>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr><th className={TH}>Channel</th><th className={TH}>What flows in</th><th className={TH}>Trust level</th></tr></thead>
          <tbody>
            {[
              ['Organiser CSV / JSON import', 'Full class results via the admin import pipeline — validated, previewed, duplicate-checked.', 'Highest — primary source'],
              ['ESNZ series publications', 'Official points tables for national series.', 'Official where labelled'],
              ['Timing & entry systems', 'Exports from Equipe, EvoEvents, Main-Events via organiser partnership or licensed API.', 'High — organiser-supplied'],
              ['Stable & user records', 'Training logs, health records, profiles claimed by riders/coaches, correction reports.', 'Verified on review'],
            ].map(([c, w, t]) => (
              <tr key={c}><td className={TD}><b>{c}</b></td><td className={`${TD} text-muted`}>{w}</td><td className={TD}><span className={badge(BADGE.green)}>{t}</span></td></tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <section className={CARD}>
        <h2 className={H2}>Pipeline: file to intelligence</h2>
        <div className="grid gap-2.5 md:grid-cols-5 mt-2">
          {[['1 · Ingest', 'CSV/JSON parsed, staged as raw results.'], ['2 · Identity', 'Names normalised; ambiguous names queue for human review.'], ['3 · Score', 'Points auto-calculated by the database trigger.'], ['4 · Aggregate', 'Rankings, trends, partnerships, series recomputed.'], ['5 · Publish', 'Labelled Provisional or Official with audit trail.']].map(([t, d]) => (
            <div key={t} className="rounded border border-line bg-card2 p-3">
              <div className="text-[13px] font-bold text-gold">{t}</div>
              <p className="text-[12.5px] text-muted mt-1">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={CARD}>
        <h2 className={H2}>Scoring methodology</h2>
        <h3 className={H3}>A · Briefing points (official leaderboard)</h3>
        <p className="text-muted text-sm mt-1 mb-2">Placing points × class multiplier, rounded, minimum 0. Non-finishers (E/R/W/DQ) score 0.</p>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr><th className={TH}>Place</th>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((p) => <th key={p} className={`${TH} ${NUM}`}>{p}</th>)}</tr></thead>
          <tbody>
            <tr><td className={TD}><b>Base</b></td>{[12, 9, 7, 6, 5, 4, 3, 2, 1, 1].map((v) => <td key={v} className={`${TD} ${NUM}`}>{v}</td>)}</tr>
          </tbody>
        </table>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 mt-3">
          {[['Grand Prix ×2.0', 'Top-tier, usually 1.40m+'], ['Premier ×1.5', 'High grade below GP'], ['Open ×1.25', 'Open entry'], ['Standard ×1.0', 'Regular classes (Young Horse incl.)'], ['Amateur ×0.75', 'Restricted'], ['Pony ×0.75', 'Restricted']].map(([t, d]) => (
            <div key={t} className="rounded border border-line bg-card2 px-3 py-2 text-[12.5px]"><b className="text-gold">{t}</b> <span className="text-muted">— {d}</span></div>
          ))}
        </div>
        <p className="text-muted text-[13px] mt-3">Worked example: winning a Grand Prix = 12 × 2.0 = <b className="text-white">24 pts</b>; 3rd in a Premier = 7 × 1.5 = <b className="text-white">11 pts</b> (rounded).</p>
        <h3 className={`${H3} mt-5`}>B · EQ Score (form index, 0–99)</h3>
        <p className="text-muted text-sm mt-1"><code>45 + clear% × 0.5 − avgFaults × 2.5 + min(starts,20) × 0.3</code>, clamped 0–99. Rewards clears, punishes faults, small experience credit. Used for form, trends and forecasts — <b className="text-white">not</b> the official leaderboard.</p>
        <h3 className={`${H3} mt-5`}>C · Windows & forecasts</h3>
        <p className="text-muted text-sm mt-1">Rankings slice All Time / 12M / 3M to the day. Forecasts project one period ahead with starts-weighted least squares and report confidence from sample depth — thin data returns no projection rather than a guess.</p>
      </section>

      <section className={CARD}>
        <h2 className={H2}>Labels you will see</h2>
        <div className="flex flex-wrap gap-2 mt-2">
          <span className={badge(BADGE.green)}>Official</span><span className="text-muted text-sm">Organiser-published table or result.</span>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          <span className={badge(BADGE.goldfill)}>Provisional</span><span className="text-muted text-sm">EQIndex calculation awaiting official confirmation.</span>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          <span className={badge(BADGE.blue)}>Independent</span><span className="text-muted text-sm">Our own computation (series, forecasts, benchmarks).</span>
        </div>
      </section>

      <section className={CARD}>
        <h2 className={H2}>Naming & corrections</h2>
        <p className="text-muted text-sm">“Kiwi-Spirit” vs “Kiwi Spirit” vs “KIWI SPIRIT” are one horse. Normalisation is deterministic; ambiguous names queue in the <b className="text-white">Naming Review</b> for a human approve/merge/reject decision, and every decision is written to the audit log. Spot an error? <a className={LINK} href="/contact">Report a correction →</a></p>
      </section>

      <section className={CARD}>
        <h2 className={H2}>Limits & fair use</h2>
        <p className="text-muted text-sm">Small samples mislead — projections hide below 3 scoring months, and surface splits flag unknown surfaces instead of guessing. Rankings reflect recorded results only; unrecorded schooling rounds don't exist here. Bulk reuse of the database requires written permission (see <a className={LINK} href="/terms">Terms →</a>). Programmatic access: <a className={LINK} href="/api-docs">API docs →</a></p>
      </section>

      <section className={CARD}>
        <h2 className={H2}>Glossary & formula history</h2>
        <p className="text-muted text-sm">Terms, height bands and class definitions: <a className={LINK} href="/glossary">Glossary →</a> · Points formula v1 (placing × multiplier) effective September 2026. Changes are versioned and announced before they affect published tables.</p>
      </section>
    </>
  );
}
