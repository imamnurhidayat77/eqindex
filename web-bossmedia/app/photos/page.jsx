import Link from 'next/link';
import { getJSON } from '../../lib/api';
import GalleryFilter from '../../components/GalleryFilter';
import FavButton from '../../components/FavButton';

export const revalidate = 30;
export const dynamic = 'force-dynamic';

const nzd = (c) => (c === null || c === undefined ? null : `NZ$${(Number(c) / 100).toFixed(2)}`);

export default async function PhotosPage({ searchParams }) {
  const sp = searchParams || {};
  const p = new URLSearchParams({ limit: '96' });
  for (const k of ['kind', 'horse', 'rider', 'event']) if (sp[k]) p.set(`${k === 'horse' ? 'horse_id' : k === 'rider' ? 'rider_id' : k === 'event' ? 'event_id' : k}`, sp[k]);
  const { data } = await getJSON(`/photos?${p}`).catch(() => ({ data: [] }));
  let rows = data || [];
  let riderName = '';
  if (sp.rider) {
    const r = await getJSON(`/riders/${encodeURIComponent(sp.rider)}`).catch(() => null);
    riderName = r?.data?.name || '';
  }
  const q = (sp.q || '').trim().toLowerCase();
  if (q) rows = rows.filter((x) => [x.horse, x.rider, x.event_name].filter(Boolean).some((v) => v.toLowerCase().includes(q)));
  return (
    <>
      <h1 className="page-title">Photos</h1>
      <p className="caption" style={{ margin: '6px 0 18px' }}>Event photos and reels, tagged to horse and rider. Watermarked previews — full resolution after purchase.</p>
      <GalleryFilter kind={sp.kind || ''} q={sp.q || ''} riderName={riderName} />
      {!rows.length ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <h3 className="card-title">No photos found</h3>
          <p className="caption">Try a different search or filter — new event photos land here after publishing.</p>
        </div>
      ) : (
        <div className="grid">
          {rows.map((x) => (
            <Link key={x.id} href={`/p/${x.id}`} className="card photo-card" style={{ position: 'relative' }}>
              {x.kind === 'reel' && <span className="badge" style={{ position: 'absolute', top: 10, left: 10 }}>▶ REEL</span>}
              {x.thumb_url || x.preview_url
                ? <img src={x.thumb_url || x.preview_url} alt="" loading="lazy" />
                : <div style={{ aspectRatio: '4/3', display: 'grid', placeItems: 'center', background: '#eceae4' }} />}
              <FavButton id={x.id} />
              <div className="cap">
                <b>{[x.horse, x.rider].filter(Boolean).join(' × ') || x.event_name || 'Untagged'}</b>
                <span>{x.event_name || ''}</span>
              </div>
              <div className="row">
                <span>{x.kind === 'reel' ? 'Video' : 'Photo'}</span>
                {nzd(x.price_cents) && <span className="price">from {nzd(x.price_cents)}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
