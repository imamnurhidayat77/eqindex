import { CARD, H1, H2, SUB, TABLE, TABLEWRAP, TD, TH, LINK } from '../../lib/tokens';

const TERMS = [
  ['Grand Prix', 'Top-tier class, usually 1.40m+. Points multiplier ×2.0.'],
  ['Premier', 'High-grade class below Grand Prix. Multiplier ×1.5.'],
  ['Open', 'Open-entry class at any height. Multiplier ×1.25.'],
  ['Standard', 'Regular class. Multiplier ×1.0.'],
  ['Young Horse', 'Age-restricted development classes (4–7yo). Multiplier ×1.0.'],
  ['Amateur / Pony', 'Restricted classes. Multiplier ×0.75.'],
  ['Clear round', 'No jumping or time faults in the round.'],
  ['Faults', 'Jumping faults (rails, refusals) plus time faults make total faults.'],
  ['Jump-off', 'Timed decider round for equal top scores.'],
  ['Two Phase', 'Format where the second phase runs immediately after a clear first phase.'],
  ['Elimination (E)', 'Excluded from placings, 0 points. Shown as E.'],
  ['Retirement (R) / Withdrawal (W) / Disqualification (DQ)', 'Non-finish states, 0 points.'],
  ['EQ Score', '0–99 form index from clear rate, faults and volume. Provisional unless labelled Official.'],
  ['Win rate', 'Wins ÷ starts × 100 over the selected window.'],
];

const HEIGHTS = [
  ['Introductory', '0.60–0.90m'],
  ['Open Horse/Pony', '1.00–1.30m'],
  ['Championship', '1.30–1.40m'],
  ['Grand Prix', '1.40m+'],
];

export default function Glossary() {
  return (
    <>
      <h1 className={H1}>Glossary</h1>
      <p className={SUB}>Class types, formats, faults rules and metric definitions. Full formula: <a className={LINK} href="/about">About →</a></p>
      <section className={CARD}>
        <h2 className={H2}>Terms</h2>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <tbody>
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
