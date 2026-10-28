import Link from 'next/link';
import { getJSON } from '../../lib/api';
import { Icon } from '../../components/figma';
import SaveButton from '../../components/SaveButton';
import PageShell from '../../components/PageShell';
import QueryFilter from '../../components/QueryFilter';

export const revalidate = 30;

export const metadata = {
  title: 'All photos',
  description: 'Browse every Boss Media photo and reel: search by horse, rider or event.',
};

export default async function PhotosPage({ searchParams }) {
  const sp = searchParams || {};
  const LIMIT = 48;
  const page = Math.max(1, parseInt(sp.page, 10) || 1);
  const p = new URLSearchParams({ limit: String(LIMIT + 1), offset: String((page - 1) * LIMIT) });
  for (const k of ['kind', 'horse', 'rider', 'event']) {
    if (sp[k]) p.set(k === 'horse' ? 'horse_id' : k === 'rider' ? 'rider_id' : k === 'event' ? 'event_id' : k, sp[k]);
  }
  const { data } = await getJSON(`/photos?${p}`).catch(() => ({ data: [] }));
  let rows = data || [];
  const q = (sp.q || '').trim().toLowerCase();
  if (q) rows = rows.filter((x) => [x.horse, x.rider, x.event_name, x.other_people].filter(Boolean).some((v) => v.toLowerCase().includes(q)));
  const hasNext = !q && rows.length > LIMIT;
  if (hasNext) rows = rows.slice(0, LIMIT);
  const base = { ...(sp.q ? { q: sp.q } : {}), ...(sp.kind ? { kind: sp.kind } : {}) };
  const hrefFor = (n) => `/photos?${new URLSearchParams({ ...base, ...(n > 1 ? { page: String(n) } : {}) })}`;

  return (
    <PageShell eyebrow="Archive / All media" title="Photos." wide
      intro="Event photos and reels, tagged to horse and rider. Watermarked previews — full resolution after purchase.">
      <form method="GET" action="/photos" className="gallery-simple-tools" style={{ marginBottom: 26 }}>
        <label className="search-box">
          <Icon name="search" />
          <span className="sr-only">Search horse, rider or event</span>
          <input name="q" defaultValue={sp.q || ''} placeholder="Search horse, rider or event" />
        </label>
        <div className="filters">
          <label className="filter"><span>Type</span>
            <QueryFilter name="kind" value={sp.kind || ''}
              options={[{ id: '', label: 'All media' }, { id: 'photo', label: 'Photos' }, { id: 'reel', label: 'Reels' }]}
              placeholder="Type" />
          </label>
        </div>
      </form>
      {!rows.length ? (
        <div className="event-media-empty">
          <p className="eyebrow">No photos found</p>
          <h3>Try another search.</h3>
        </div>
      ) : (
        <div className="event-media-grid">
          {rows.map((x) => (
            <article className="event-media-card" key={x.id}>
            <Link style={{ display: 'block' }} href={`/p/${x.id}`}
              aria-label={`${x.horse || ''} ${x.rider || ''}`.trim() || 'Photo'}>
              {x.thumb_url || x.preview_url
                ? <img src={x.thumb_url || x.preview_url} alt={`${[x.horse, x.rider].filter(Boolean).join(' ridden by ') || 'Equestrian photo'} at ${x.event_name || 'a New Zealand show'}`} loading="lazy" />
                : <span className="cover-fallback">Boss Media</span>}
              <span className="media-kind">{x.kind === 'reel' && <Icon name="play" size={13} />}{x.kind === 'reel' ? 'Reel' : 'Photo'}</span>
              <span className="media-card-footer">
                <small title={x.event_name || ''}>{x.event_name || '—'}</small>
                <span className="media-card-title">
                  <strong>{[x.horse, x.rider].filter(Boolean).join(' · ') || x.other_people || x.event_name || 'Untagged'}</strong>
                  <Icon name="arrow" size={15} />
                </span>
              </span>
            </Link>
            <SaveButton id={x.id} />
            </article>
          ))}
        </div>
      )}
      {(page > 1 || hasNext) && (
        <nav className="my-pager" aria-label="Pagination">
          {page > 1
            ? <Link href={hrefFor(page - 1)}>← Prev</Link>
            : <button type="button" disabled>← Prev</button>}
          <button type="button" className="on" aria-current="page">{page}</button>
          {hasNext
            ? <Link href={hrefFor(page + 1)}>Next →</Link>
            : <button type="button" disabled>Next →</button>}
        </nav>
      )}
    </PageShell>
  );
}
