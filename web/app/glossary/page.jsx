import Link from 'next/link';
import { CARD, H1, H2, SUB, TABLE, TABLEWRAP, TD, TH } from '../../lib/tokens';
import { getRules, rulesTag } from '../../lib/scoring';

const TERMS = [
  ['Grand Prix', 'Top-tier class, usually 1.40m+.'],
  ['Premier', 'High-grade class below Grand Prix.'],
  ['Open', 'Open-entry class at any height.'],
  ['Standard', 'Regular class.'],
  ['Young Horse', 'Age-restricted development classes (4–7yo).'],
  ['Amateur / Pony', 'Restricted classes.'],
  ['Clear round', 'No jumping or time faults in the round.'],
  ['Faults', 'Jumping faults (rails, refusals) plus time faults make total faults.'],
  ['Jump-off', 'Timed decider round for equal top scores.'],
  ['Two Phase', 'Format where the second phase runs immediately after a clear first phase.'],
  ['Elimination (E)', 'Excluded from placings, 0 points. Shown as E.'],
  ['Retirement (R) / Withdrawal (W) / Disqualification (DQ)', 'Non-finish states, 0 points.'],
  ['Win rate', 'Wins ÷ starts × 100 over the selected window.'],
];

const HEIGHTS = [
  ['Introductory', '0.60–0.90m'],
  ['Open Horse/Pony', '1.00–1.30m'],
  ['Championship', '1.30–1.40m'],
  ['Grand Prix', '1.40m+'],
];

export default async function Glossary() {
  const rules = await getRules().catch(() => null);
  const ptsDef = rules
    ? `Most points wins (${rulesTag(rules.meta)}).`
    : 'Most points wins.';
  return (
    <>
      <h1 className={H1}>Glossary</h1>
      <p className={SUB}>Class types, formats and faults rules.</p>
      <section className={CARD}>
        <h2 className={H2}>Terms</h2>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <tbody>
            <tr><td className={TD}><b>Points</b></td><td className={`${TD} text-muted`}>{ptsDef}</td></tr>
            {TERMS.map(([t, d]) => (
              <tr key={t}><td className={TD}><b>{t}</b></td><td className={`${TD} text-muted`}>{d}</td></tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
      <section className={CARD}>
        <h2 className={H2}>Height bands</h2>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr><th className={TH}>Band</th><th className={TH}>Heights</th></tr></thead>
          <tbody>
            {HEIGHTS.map(([t, d]) => (
              <tr key={t}><td className={TD}><b>{t}</b></td><td className={TD}>{d}</td></tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    </>
  );
}
