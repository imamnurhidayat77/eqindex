import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJSON } from '../../../lib/api';
import BuyBox from '../../../components/BuyBox';

export const revalidate = 30;

export default async function PhotoDetail({ params }) {
  const res = await getJSON(`/photos/${params.id}`).catch(() => null);
  if (!res?.data) notFound();
  const d = res.data;
  const title = [d.horse, d.rider].filter(Boolean).join(' × ') || d.event_name || 'Photo';
  return (
    <>
      <p className="meta" style={{ marginBottom: 10 }}>
        <Link href="/">Gallery</Link> / {d.event_name || 'Event'} / {d.kind === 'reel' ? 'Reel' : 'Photo'}
      </p>
      <h1 style={{ margin: '0 0 4px', fontSize: 30 }}>{title}</h1>
      <p className="meta" style={{ marginTop: 0 }}>{d.event_name || ''}{d.class_name ? ` · ${d.class_name}` : ''}</p>
      <div className="detail" style={{ marginTop: 18 }}>
        <div className="stage">
          {d.kind === 'reel' ? (
            d.preview_url ? <video src={d.preview_url} controls playsInline preload="metadata" poster={d.thumb_url || undefined} />
              : <div style={{ padding: 60, textAlign: 'center' }}>🎬</div>
          ) : d.preview_url ? (
            <img src={d.preview_url} alt={title} width={d.width || undefined} height={d.height || undefined} />
          ) : (
            <div style={{ padding: 60, textAlign: 'center' }}>📷</div>
          )}
        </div>
        <div>
          <BuyBox id={d.id} defaultTier={d.license_default} />
          <p className="meta">Photographer: <b>{d.photographer || 'Boss Media'}</b></p>
        </div>
      </div>
    </>
  );
}
