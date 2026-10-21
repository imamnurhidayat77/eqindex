import Link from 'next/link';
import { getJSON } from '../lib/api';

export const revalidate = 30;

const nzd = (c) => (c === null || c === undefined ? null : `NZ$${(Number(c) / 100).toFixed(2)}`);

export default async function Home() {
  const { data } = await getJSON('/photos?limit=24').catch(() => ({ data: [] }));
  const rows = data || [];
  return (
    <>
      <section className="hero">
        <h1>Riders and Horses. Elevated.</h1>
        <p>Official event photography — watermarked previews, full resolution after purchase.</p>
      </section>
      <div className="grid">
        {rows.map((x) => (
          <Link key={x.id} href={`/p/${x.id}`} className="card">
            {x.kind === 'reel' && <span className="badge">▶ REEL</span>}
            {x.thumb_url || x.preview_url
              ? <img src={x.thumb_url || x.preview_url} alt="" loading="lazy" />
              : <div style={{ aspectRatio: '4/3', display: 'grid', placeItems: 'center', fontSize: 28 }}>📷</div>}
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
      {!rows.length && <p className="meta">Fresh galleries land here after each event.</p>}
    </>
  );
}
