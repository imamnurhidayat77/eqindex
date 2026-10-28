import { notFound } from 'next/navigation';
import { getJSON } from '../../../lib/api';
import { SiteFooter, SiteHeader } from '../../../components/figma';
import MediaPurchase from '../../../components/MediaPurchase';
import ProductJsonLd from '../../../components/ProductJsonLd';

export const revalidate = 30;

async function photoWithPrice(id) {
  const [res, tiers] = await Promise.all([
    getJSON(`/photos/${id}`).catch(() => null),
    getJSON('/api/license-tiers').catch(() => ({ data: [] })),
  ]);
  const d = res?.data;
  if (!d) return {};
  const tier = (tiers?.data || []).find((t) => String(t.id) === String(d.license_default || 'web'));
  return { d, priceCents: tier ? Number(tier.price_cents) : undefined };
}

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

export default async function PhotoDetail({ params }) {
  const { d, priceCents } = await photoWithPrice(params.id);
  if (!d) notFound();
  return (
    <div className="media-detail-page">
      <ProductJsonLd media={d} priceCents={priceCents} path={`/p/${params.id}`}
        description={`Buy this ${d.kind === 'reel' ? 'reel' : 'photo'} of ${[d.horse, d.rider].filter(Boolean).join(' × ')} at ${d.event_name} — watermark-free download after checkout.`} />
      <SiteHeader />
      <MediaPurchase
        media={d}
        eventName={d.event_name || 'Event gallery'}
        eventSlug={null}
        backHref="/photos"
        backLabel="Back to collection"
      />
      <SiteFooter />
    </div>
  );
}
