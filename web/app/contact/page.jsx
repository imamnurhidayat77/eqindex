import { CARD, H1, MUT, SUB } from '../../lib/tokens';
export default function Contact() {
  return (
    <>
      <h1 className={H1}>Contact</h1>
      <p className={SUB}>Organisers, riders, and data corrections.</p>
      <section className={CARD}>
        <p>To submit show results, request data corrections, or discuss data
        partnerships (ESNZ, timing providers):</p>
        <p><b>hello@eqindex.example.nz</b></p>
        <p className={MUT}>Result files accepted: CSV and Excel exports from common
        timing systems. Series and calendar gaps can also be flagged for review.</p>
      </section>
    </>
  );
}
