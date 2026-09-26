import { getJSON } from '../../../../lib/api';
import { CARD, EMPTY, H1, SUB, TABLE, TABLEWRAP, TD, TH, NUM, LINK } from '../../../../lib/tokens';

export const dynamic = 'force-dynamic';

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
  const rows = r.data || [];
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
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr>
            <th className={TH}>Rank</th><th className={TH}>Rider</th>
            <th className={`${TH} ${NUM}`}>Points</th><th className={`${TH} ${NUM}`}>Podiums</th>
            <th className={`${TH} ${NUM}`}>Win Rate</th><th className={`${TH} ${NUM}`}>Rounds</th><th className={`${TH} ${NUM}`}>Wins</th>
          </tr></thead>
          <tbody>
            {rows.map((x, i) => (
              <tr key={x.rider_id}>
                <td className={i === 0 ? 'text-gold font-bold' : 'text-muted'}>#{i + 1}</td>
                <td className={TD}><a href={`/riders/${x.rider_id}`} className="text-white font-semibold no-underline hover:text-gold">{x.rider}</a></td>
                <td className={`${TD} ${NUM}`}><b className={i === 0 ? 'text-gold' : ''}>{x.total_points}</b></td>
                <td className={`${TD} ${NUM} text-muted`}>{x.podiums ?? '–'}</td>
                <td className={`${TD} ${NUM} text-muted`}>{x.win_rate == null ? '–' : `${Number(x.win_rate).toFixed(1)}%`}</td>
                <td className={`${TD} ${NUM} text-muted`}>{x.starts}</td>
                <td className={`${TD} ${NUM} text-muted`}>{x.wins}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className={EMPTY}>No ranked riders in this category yet — assign categories in Admin → Riders.</td></tr>}
          </tbody>
        </table>
        </div>
      </section>
      <p className="text-[12px] text-faint">Riders without a category compete as Open. <a className={LINK} href="/rankings">National leaderboard →</a></p>
    </>
  );
}
