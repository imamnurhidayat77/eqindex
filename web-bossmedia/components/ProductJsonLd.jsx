import { SITE_URL } from '../lib/api';

// Server-rendered rich-result markup for photo/reel detail pages.
// Google reads the price + image straight from here (Images + Shopping).
export default function ProductJsonLd({ media, priceCents, path, description }) {
  if (!media?.id) return null;
  const who = [media.horse, media.rider].filter(Boolean).join(' × ') || 'Event photo';
  const name = `${who} — ${media.event_name || 'New Zealand show'}`;
  const image = media.thumb_url || media.preview_url || undefined;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    ...(description ? { description } : {}),
    ...(image ? { image } : {}),
    brand: { '@type': 'Brand', name: media.photographer || 'Boss Media' },
    ...(Number.isInteger(priceCents) && priceCents > 0 ? {
      offers: {
        '@type': 'Offer',
        priceCurrency: 'NZD',
        price: (priceCents / 100).toFixed(2),
        availability: 'https://schema.org/InStock',
        url: `${SITE_URL}${path}`,
      },
    } : {}),
  };
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
  );
}
