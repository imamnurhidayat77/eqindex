import { notFound } from 'next/navigation';
import { getJSON } from '../../../../../lib/api';
import { SiteFooter, SiteHeader } from '../../../../../components/figma';
import MediaPurchase from '../../../../../components/MediaPurchase';
import ProductJsonLd from '../../../../../components/ProductJsonLd';

export const revalidate = 30;

export async function generateMetadata({ params }) {
  const res = await getJSON(`/photos/${params.id}`).catch(() => null);
  const d = res?.data;
  if (!d) return { title: 'Photo not found' };
  const who = [d.horse, d.rider].filter(Boolean).join(' × ') || 'Event photo';
  const title = `${who} — ${d.event_name || 'New Zealand show'}`;
  const description = `Buy this ${d.kind === 'reel' ? 'reel' : 'photo'} of ${who} at ${d.event_name || 'a New Zealand show'} — watermark-free download after checkout.`;
  const images = d.thumb_url || d.preview_url ? [{ url: d.thumb_url || d.preview_url }] : undefined;
  return { title, description, openGraph: { title, description, images } };
}

export default async function EventMediaPage({ params }) {
  const [{ data: events }, res, tiers] = await Promise.all([
    getJSON('/events?limit=200').catch(() => ({ data: [] })),
    getJSON(`/photos/${params.id}`).catch(() => ({ data: null })),
    getJSON('/api/license-tiers').catch(() => ({ data: [] })),
  ]);
  const media = res.data;
  if (!media) notFound();
  const event = (events || []).find((e) => (e.slug || e.id) === params.slug);
  const eventName = event?.name || media.event_name || 'Event gallery';
  const tier = (tiers?.data || []).find((t) => String(t.id) === String(media.license_default || 'web'));
  const backHref = event ? `/events/${event.slug || event.id}` : '/events';
  return (
    <div className="media-detail-page">
      <ProductJsonLd media={media} priceCents={tier ? Number(tier.price_cents) : undefined}
        path={`${backHref}/media/${params.id}`}
        description={`Buy this ${media.kind === 'reel' ? 'reel' : 'photo'} of ${[media.horse, media.rider].filter(Boolean).join(' × ')} at ${eventName} — watermark-free download after checkout.`} />
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
