import { CARD, H1, H2, MUT, SUB } from '../../lib/tokens';

export default function About() {
  return (
    <>
      <h1 className={H1}>About EQIndex</h1>
      <p className={SUB}>The elite horse intelligence platform. Connecting data, horses, and riders.</p>
      <section className={CARD}>
        <h2 className={H2}>Evidence-based equestrian intelligence</h2>
        <p>EQIndex turns New Zealand show jumping competition results into
        evidence-based horse and rider performance insights: rankings, clear-round
        analytics, horse–rider partnership analysis, event difficulty profiles,
        and national series standings.</p>
        <p className={MUT}>Data is compiled from organiser result files and public
        series publications, cleaned through human-reviewed naming curation, and
        published with transparent methodology. EQ Score is a documented composite
        of clear-round rate, average faults, and competition volume.</p>
      </section>
    </>
  );
}
