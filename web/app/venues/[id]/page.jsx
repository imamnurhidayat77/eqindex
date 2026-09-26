import { getJSON } from '../../../lib/api';
import { CARD, EMPTY, H1, SUB, H2, TABLE, TABLEWRAP, TD, TH, NUM, LINK } from '../../../lib/tokens';

export const dynamic = 'force-dynamic';

export default async function VenueDetail({ params }) {
  const v = await getJSON(`/venues/${params.id}`).catch(() => null);
  if (!v?.data) {
    return (<><h1 className={H1}>Venue not found</h1><p className={SUB}><a className={LINK} href="/venues">← All venues</a></p></>);
  }
  const d = v.data;
  return (
    <>
      <div className="mb-1 text-[12px] text-faint">
        <a href="/venues" className="text-muted hover:text-white">Venues</a>
        <span className="mx-1.5">/</span><span className="text-gold">{d.name}</span>
      </div>
      <h1 className={H1}>{d.name}</h1>
      <p className={SUB}>{d.region || 'New Zealand'}{d.lat ? ` · ${Number(d.lat).toFixed(2)}, ${Number(d.lon).toFixed(2)}` : ''} · {d.event_count} events · {d.rounds} rounds.</p>
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <h2 className={H2}>Events at this venue</h2>
          <section className={CARD}>
            <div className={TABLEWRAP}>
            <table className={TABLE}>
              <thead><tr><th className={TH}>Event</th><th className={TH}>Dates</th><th className={`${TH} ${NUM}`}>Rounds</th></tr></thead>
              <tbody>
                {(d.events || []).map((e) => (
                  <tr key={e.id}>
                    <td className={TD}><a className={LINK} href={`/events/${e.id}`}><b>{e.name}</b></a></td>
                    <td className={`${TD} text-muted`}>{(e.date_start || '').slice(0, 10)}</td>
                    <td className={`${TD} ${NUM} text-muted`}>{e.round_count}</td>
                  </tr>
                ))}
                {!(d.events || []).length && <tr><td colSpan={3} className={EMPTY}>No events linked.</td></tr>}
              </tbody>
            </table>
            </div>
          </section>
        </div>
        <div>
          <h2 className={H2}>Top horses here</h2>
          <section className={CARD}>
            <div className={TABLEWRAP}>
            <table className={TABLE}>
              <thead><tr><th className={TH}>Horse</th><th className={`${TH} ${NUM}`}>Rounds</th><th className={`${TH} ${NUM}`}>Clear %</th></tr></thead>
              <tbody>
                {(d.topHorses || []).map((h) => (
                  <tr key={h.horse_id}>
                    <td className={TD}><a className={LINK} href={`/horses/${h.horse_id}`}>{h.horse}</a></td>
                    <td className={`${TD} ${NUM} text-muted`}>{h.starts}</td>
                    <td className={`${TD} ${NUM} text-moss`}>{Number(h.clear_pct).toFixed(0)}%</td>
                  </tr>
                ))}
                {!(d.topHorses || []).length && <tr><td colSpan={3} className={EMPTY}>Not enough rounds yet.</td></tr>}
              </tbody>
            </table>
            </div>
          </section>
          <h2 className={H2}>Top riders here</h2>
          <section className={CARD}>
            <div className={TABLEWRAP}>
            <table className={TABLE}>
              <thead><tr><th className={TH}>Rider</th><th className={`${TH} ${NUM}`}>Rounds</th><th className={`${TH} ${NUM}`}>Clear %</th></tr></thead>
              <tbody>
                {(d.topRiders || []).map((r) => (
                  <tr key={r.rider_id}>
                    <td className={TD}><a className={LINK} href={`/riders/${r.rider_id}`}>{r.rider}</a></td>
                    <td className={`${TD} ${NUM} text-muted`}>{r.starts}</td>
                    <td className={`${TD} ${NUM} text-moss`}>{Number(r.clear_pct).toFixed(0)}%</td>
                  </tr>
                ))}
                {!(d.topRiders || []).length && <tr><td colSpan={3} className={EMPTY}>Not enough rounds yet.</td></tr>}
              </tbody>
            </table>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
