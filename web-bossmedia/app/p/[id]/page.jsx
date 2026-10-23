import { notFound } from 'next/navigation';
import { getJSON } from '../../../lib/api';
import { SiteFooter, SiteHeader } from '../../../components/figma';
import MediaPurchase from '../../../components/MediaPurchase';

export const revalidate = 30;

export default async function PhotoDetail({ params }) {
  const res = await getJSON(`/photos/${params.id}`).catch(() => null);
  if (!res?.data) notFound();
  const d = res.data;
  return (
    <div className="media-detail-page">
      <SiteHeader />
      <MediaPurchase
        media={d}
        eventName={d.event_name || 'Event gallery'}
        eventSlug={null}
        backHref="/photos"
        backLabel="Back to photos"
      />
      <SiteFooter />
    </div>
  );
}
