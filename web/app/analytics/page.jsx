import { getJSON } from '../../lib/api';
import { CARD, EMPTY, H1, H2, NUM, SUB, TABLE, TABLEWRAP, TD, TH } from '../../lib/tokens';
import ChipSelect from '../../components/ChipSelect';

export const dynamic = 'force-dynamic';

const TYPES = ['Grand Prix', 'Premier', 'Open', 'Standard', 'Young Horse', 'Amateur', 'Pony'];
const FORMATS = ['Two-phase', 'Jump-off', 'Speed', 'Power & Speed'];

const s = (sp, k) => (Array.isArray(sp?.[k]) ? sp[k][0] : sp?.[k]);

export default async function Analytics({ searchParams }) {
  const type = s(searchParams, 'type') || '';
  const format = s(searchParams, 'format') || '';
  const extra = `${type ? `&type=${encodeURIComponent(type)}` : ''}${format ? `&format=${encodeURIComponent(format)}` : ''}`;
  const [cls, hh] = await Promise.all([
    getJSON(`/classes?limit=50${extra}`),
    getJSON('/height-stats?limit=100'),
  ]);
  const href = (patch) => {
    const p = new URLSearchParams();
    const t = patch.type !== undefined ? patch.type : type;
    const f = patch.format !== undefined ? patch.format : format;
    if (t) p.set('type', t);
    if (f) p.set('format', f);
    const q = p.toString();
    return q ? `/analytics?${q}` : '/analytics';
  };
  return (
    <>
      <h1 className={H1}>Analytics</h1>
      <p className={SUB}>Class difficulty and height progression across the circuit.</p>
      <h2 className={H2}>Class difficulty</h2>
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <ChipSelect label="Class Type" value={type} active={!!type} clearHref={href({ type: '' })}
          options={[{ value: '', label: 'All Types', href: href({ type: '' }) },
            ...TYPES.map((t) => ({ value: t, label: t, href: href({ type: t }) }))]} />
        <ChipSelect label="Format" value={format} active={!!format} clearHref={href({ format: '' })}
          options={[{ value: '', label: 'All Formats', href: href({ format: '' }) },
            ...FORMATS.map((t) => ({ value: t, label: t, href: href({ format: t }) }))]} />
        {(type || format) && <a href="/analytics" className="text-sky text-xs no-underline ml-1">Reset</a>}
      </div>
      <section className={CARD}>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr><th className={TH}>Event</th><th className={TH}>Class</th><th className={TH}>Type</th><th className={TH}>Format</th><th className={`${TH} ${NUM}`}>Height</th><th className={`${TH} ${NUM}`}>Starters</th><th className={`${TH} ${NUM}`}>Clear %</th><th className={`${TH} ${NUM}`}>Avg faults</th></tr></thead>
          <tbody>
            {cls.data.map((c) => (
              <tr key={c.class_id}>
                <td className={TD}>{c.event}</td><td className={TD}>{c.class}</td>
                <td className={TD}>{c.class_type || '–'}</td>
                <td className={TD}>{c.format || '–'}</td>
                <td className={`${TD} ${NUM}`}>{c.height_cm ? `${c.height_cm}cm` : '–'}</td>
                <td className={`${TD} ${NUM}`}>{c.starters}</td>
                <td className={`${TD} ${NUM} text-moss`}>{c.clear_pct === null ? '–' : `${Number(c.clear_pct).toFixed(1)}%`}</td>
                <td className={`${TD} ${NUM}`}>{c.avg_faults === null ? '–' : Number(c.avg_faults).toFixed(2)}</td>
              </tr>
            ))}
            {!cls.data.length && <tr><td colSpan={8} className={EMPTY}>No class data available.</td></tr>}
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
