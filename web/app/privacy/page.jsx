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
      <section className={CARD}>
        <h2 className="text-[15px] font-bold mb-2">Name opt-out (privacy blur)</h2>
        <p>Riders (or parents/guardians of young riders) can ask for a name to be
        withheld from public display — for example junior and pony riders. An
        opted-out rider or horse appears under a stable pseudonym
        (e.g. “Rider 3F9A”) with a 🔒 Private badge.</p>
        <p className={MUT}>The underlying results still count toward rankings,
        partnerships and trends — only the displayed name (plus profile photo
        and bio, where present) is hidden. Verified riders can toggle this
        themselves from their profile page; otherwise contact us via the
        Contact page and an administrator will apply it.</p>
      </section>
    </>
  );
}
