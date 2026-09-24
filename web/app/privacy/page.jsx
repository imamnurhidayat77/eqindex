import { CARD, H1, MUT, SUB } from '../../lib/tokens';
export default function Privacy() {
  return (
    <>
      <h1 className={H1}>Privacy</h1>
      <p className={SUB}>How EQIndex handles data.</p>
      <section className={CARD}>
        <p>Competition results shown on EQIndex are sporting records already made
        public by event organisers. Personal data is limited to names and
        regions as they appear in published results.</p>
        <p className={MUT}>Private stable records (training, health) are visible
        only in this demo context. Corrections or removal requests: contact us
        via the Contact page.</p>
      </section>
    </>
  );
}
