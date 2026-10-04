import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getJSON } from '../../../../lib/api';
import { CARD, H1, SUB, LINK } from '../../../../lib/tokens';
import { CategoryTable } from '../../../../components/SeriesTables';
import { EmptyState } from '../../../../components/EmptyState';
import { keyOptions, resolveKey } from '../../../../lib/categories';

export const revalidate = 30;

// URL slug = master category key (Admin → Categories). The one renamed slug
// keeps working via redirect so bookmarks survive the key migration.
const LEGACY_SLUGS = { 'young-rider': 'young' };

const DESCRIPTIONS = {
  pro: 'Open-class riders at the sharp end of the circuit.',
  young: 'Transitional youth division below senior open.',
  junior: 'Riders competing in junior divisions.',
  amateur: 'Non-professional riders.',
  pony: 'Pony-mounted riders across heights.',
};

export default async function SeriesCategory({ params }) {
  const slug = params.cat;
  if (LEGACY_SLUGS[slug]) redirect(`/series/category/${LEGACY_SLUGS[slug]}`);
  let master = null;
  try { master = (await getJSON('/categories')).data || null; } catch { /* fallback list */ }
  const key = resolveKey(master, slug);
  const opts = keyOptions(master);
  if (!key) {
    return (
      <>
        <h1 className={H1}>Unknown series</h1>
        <p className={SUB}>Valid categories: {opts.map((o) => o.value).join(', ')}.</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {opts.map((o) => (
            <Link key={o.value} href={`/series/category/${o.value}`}
              className="text-xs rounded-full px-3 py-[6px] border border-line bg-card2 text-muted no-underline">{o.label}</Link>
          ))}
        </div>
      </>
    );
  }
  const label = opts.find((o) => o.value === key)?.label || key;
  const r = await getJSON(`/rankings/riders?limit=100&metric=points&series=${encodeURIComponent(key)}`).catch(() => ({ data: [] }));
  const rows = (r.data || []).map((x, i) => ({ ...x, _rank: i + 1 }));
  return (
    <>
      <div className="mb-1 text-[12px] text-faint">
        <Link href="/series" className="text-muted hover:text-white">Series</Link>
        <span className="mx-1.5">/</span>
        <span className="text-gold">{label}</span>
      </div>
      <h1 className={H1}>{label} Series</h1>
      <p className={SUB}>{DESCRIPTIONS[key] || 'Riders in this master category.'} Ranked by points.</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {opts.map((o) => (
          <Link key={o.value} href={`/series/category/${o.value}`}
            className={`text-xs rounded-full px-3 py-[6px] border no-underline ${o.value === key ? 'bg-goldbg border-gold text-gold font-bold' : 'bg-card2 border-line text-muted'}`}>{o.label}</Link>
        ))}
      </div>
      <section className={CARD}>
        <CategoryTable rows={rows} />
        {!rows.length && (
          <EmptyState
            icon="🏇"
            title="No ranked riders in this category yet"
            hint="Categories are assigned per rider — ask an admin to set them under Admin → Riders."
            action={<Link className={LINK} href="/rankings">National leaderboard →</Link>}
            compact
          />
        )}
      </section>
      <p className="text-[12px] text-faint">Riders without a category compete unranked here. <Link className={LINK} href="/rankings">National leaderboard →</Link></p>
    </>
  );
}
