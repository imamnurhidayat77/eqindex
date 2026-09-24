import { getJSON } from '../../lib/api';
import { CARD, EMPTY, H1, H2, NUM, SUB, TABLE, TABLEWRAP, TD, TH } from '../../lib/tokens';

export const dynamic = 'force-dynamic';

export default async function Analytics() {
  const [cls, hh] = await Promise.all([
    getJSON('/classes?limit=50'),
    getJSON('/height-stats?limit=100'),
  ]);
  return (
    <>
      <h1 className={H1}>Analytics</h1>
      <p className={SUB}>Class difficulty and height progression across the circuit.</p>
      <h2 className={H2}>Class difficulty</h2>
      <section className={CARD}>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr><th className={TH}>Event</th><th className={TH}>Class</th><th className={`${TH} ${NUM}`}>Height</th><th className={`${TH} ${NUM}`}>Starters</th><th className={`${TH} ${NUM}`}>Clear %</th><th className={`${TH} ${NUM}`}>Avg faults</th></tr></thead>
          <tbody>
            {cls.data.map((c) => (
              <tr key={c.class_id}>
                <td className={TD}>{c.event}</td><td className={TD}>{c.class}</td>
                <td className={`${TD} ${NUM}`}>{c.height_cm ? `${c.height_cm}cm` : '–'}</td>
                <td className={`${TD} ${NUM}`}>{c.starters}</td>
                <td className={`${TD} ${NUM} text-moss`}>{c.clear_pct === null ? '–' : `${Number(c.clear_pct).toFixed(1)}%`}</td>
                <td className={`${TD} ${NUM}`}>{c.avg_faults === null ? '–' : Number(c.avg_faults).toFixed(2)}</td>
              </tr>
            ))}
            {!cls.data.length && <tr><td colSpan={6} className={EMPTY}>No class data available.</td></tr>}
          </tbody>
        </table>
        </div>
      </section>
      <h2 className={H2}>Height progression</h2>
      <section className={CARD}>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr><th className={TH}>Horse</th><th className={`${TH} ${NUM}`}>Height</th><th className={`${TH} ${NUM}`}>Starts</th><th className={`${TH} ${NUM}`}>Clear %</th></tr></thead>
          <tbody>
            {hh.data.map((x, i) => (
              <tr key={i}>
                <td className={TD}><a href={`/horses/${x.horse_id}`} className="text-white font-semibold hover:text-gold transition-colors">{x.horse}</a></td>
                <td className={`${TD} ${NUM}`}>{x.height_cm}cm</td>
                <td className={`${TD} ${NUM}`}>{x.starts}</td>
                <td className={`${TD} ${NUM} text-moss`}>{Number(x.clear_pct).toFixed(1)}%</td>
              </tr>
            ))}
            {!cls.data.length && <tr><td colSpan={6} className={EMPTY}>No class data available.</td></tr>}
          </tbody>
        </table>
        </div>
      </section>
    </>
  );
}
