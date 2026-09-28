import { getJSON } from '../../lib/api';
import { CARD, H1, H2, SUB } from '../../lib/tokens';
import ChipSelect from '../../components/ChipSelect';
import { ClassDifficultyTable, HeightProgressTable } from '../../components/AnalyticsTables';

export const revalidate = 30;

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
        <ClassDifficultyTable rows={cls.data} />
      </section>
      <h2 className={H2}>Height progression</h2>
      <section className={CARD}>
        <HeightProgressTable rows={hh.data} />
      </section>
    </>
  );
}
