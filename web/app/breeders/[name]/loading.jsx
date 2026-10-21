import { CARD, H1, SUB } from '../../../lib/tokens';
import { Sk, StatGrid, TableSk } from '../../../components/Skeletons';

// Mirrors breeder detail: H1 + sub, StatGrid, division summary card, tables.
export default function Loading() {
  return (
    <>
      <div className="mb-1"><Sk className="h-8 w-64 max-w-full !rounded-md" /></div>
      <p className={SUB}><Sk className="h-3.5 w-72 max-w-full" /></p>
      <StatGrid n={4} />
      <section className={CARD}>
        <Sk className="h-5 w-48 mb-3" />
        <Sk className="h-16 w-full !rounded-lg" />
      </section>
      <TableSk cols={5} rows={8} />
      <TableSk cols={5} rows={6} />
    </>
  );
}
