import { notFound } from 'next/navigation';
import { getJSON } from '../../../../../lib/api';
import { SiteFooter, SiteHeader } from '../../../../../components/figma';
import MediaPurchase from '../../../../../components/MediaPurchase';

export const revalidate = 30;

export default async function EventMediaPage({ params }) {
  const [{ data: events }, res] = await Promise.all([
    getJSON('/events?limit=200').catch(() => ({ data: [] })),
    getJSON(`/photos/${params.id}`).catch(() => ({ data: null })),
  ]);
  const media = res.data;
  if (!media) notFound();
  const event = (events || []).find((e) => (e.slug || e.id) === params.slug);
  const eventName = event?.name || media.event_name || 'Event gallery';
  return (
    <div className="media-detail-page">
      <SiteHeader />
      <MediaPurchase
        media={media}
        eventName={eventName}
        eventSlug={event ? (event.slug || event.id) : null}
        backHref={event ? `/events/${event.slug || event.id}` : '/events'}
        backLabel="Back to collection"
      />
      <SiteFooter />
    </div>
  );
}
