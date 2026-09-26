import { getJSON } from '../../lib/api';
import { CARD, EMPTY, H1, SUB, TABLE, TABLEWRAP, TD, TH, NUM, LINK } from '../../lib/tokens';

export const dynamic = 'force-dynamic';

export default async function Venues() {
  const v = await getJSON('/venues').catch(() => ({ data: [] }));
  const rows = [...(v.data || [])].sort((a, b) => Number(b.rounds) - Number(a.rounds));
  return (
    <>
      <h1 className={H1}>Venues</h1>
      <p className={SUB}>One venue can host many arenas — performance splits live on profiles.</p>
      <section className={CARD}>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr><th className={TH}>Venue</th><th className={TH}>Region</th><th className={`${TH} ${NUM}`}>Events</th><th className={`${TH} ${NUM}`}>Rounds</th><th className={TH}></th></tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id}>
                <td className={TD}><b>{x.name}</b></td>
                <td className={`${TD} text-muted`}>{x.region || '—'}</td>
                <td className={`${TD} ${NUM} text-muted`}>{x.events}</td>
                <td className={`${TD} ${NUM} text-muted`}>{x.rounds}</td>
                <td className={`${TD} ${NUM}`}><a className={LINK} href={`/venues/${x.id}`}>Open →</a></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className={EMPTY}>No venues recorded.</td></tr>}
          </tbody>
        </table>
        </div>
      </section>
    </>
  );
}
