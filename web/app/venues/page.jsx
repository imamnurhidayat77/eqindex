import { getJSON } from '../../lib/api';
import { CARD, H1, SUB } from '../../lib/tokens';
import VenuesTable from '../../components/VenuesTable';

export const revalidate = 30;

export default async function Venues() {
  const v = await getJSON('/venues').catch(() => ({ data: [] }));
  const rows = [...(v.data || [])].sort((a, b) => Number(b.rounds) - Number(a.rounds));
  return (
    <>
      <h1 className={H1}>Venues</h1>
      <p className={SUB}>One venue can host many arenas — performance splits live on profiles.</p>
      <section className={CARD}>
        <VenuesTable rows={rows} />
      </section>
    </>
  );
}
