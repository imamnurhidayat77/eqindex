import { getJSON } from '../../../../lib/api';
import { CARD, EMPTY, H1, SUB, LINK } from '../../../../lib/tokens';
import { CategoryTable } from '../../../../components/SeriesTables';

export const revalidate = 30;

const CATS = {
  junior: 'Junior Rider',
  'young-rider': 'Young Rider',
  'under-25': 'Under 25',
  amateur: 'Amateur Rider',
  pony: 'Pony Rider',
};
const TO_DB = { junior: 'Junior', 'young-rider': 'Young Rider', 'under-25': 'Under 25', amateur: 'Amateur', pony: 'Pony' };

const DESCRIPTIONS = {
  junior: 'Riders competing in junior divisions.',
  'young-rider': 'Transitional youth division below senior open.',
  'under-25': 'Riders aged under 25.',
  amateur: 'Non-professional riders.',
  pony: 'Pony-mounted riders across heights.',
};

export default async function SeriesCategory({ params }) {
  const cat = params.cat;
  const label = CATS[cat];
  if (!label) {
    return (
      <>
        <h1 className={H1}>Unknown series</h1>
        <p className={SUB}>Valid categories: {Object.keys(CATS).join(', ')}.</p>
      </>
    );
  }
  const r = await getJSON(`/rankings/riders?limit=100&metric=points&series=${encodeURIComponent(TO_DB[cat])}`).catch(() => ({ data: [] }));
  const rows = (r.data || []).map((x, i) => ({ ...x, _rank: i + 1 }));
  return (
    <>
      <div className="mb-1 text-[12px] text-faint">
        <a href="/series" className="text-muted hover:text-white">Series</a>
        <span className="mx-1.5">/</span>
        <span className="text-gold">{label}</span>
      </div>
      <h1 className={H1}>{label} Series</h1>
      <p className={SUB}>{DESCRIPTIONS[cat]} Ranked by briefing points.</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(CATS).map(([k, l]) => (
          <a key={k} href={`/series/category/${k}`}
            className={`text-xs rounded-full px-3 py-[6px] border no-underline ${k === cat ? 'bg-goldbg border-gold text-gold font-bold' : 'bg-card2 border-line text-muted'}`}>{l}</a>
        ))}
      </div>
      <section className={CARD}>
        <CategoryTable rows={rows} />
        {!rows.length && <p className={EMPTY}>No ranked riders in this category yet — assign categories in Admin → Riders.</p>}
      </section>
      <p className="text-[12px] text-faint">Riders without a category compete as Open. <a className={LINK} href="/rankings">National leaderboard →</a></p>
    </>
  );
}
