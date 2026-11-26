import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJSON } from '../../../lib/api';
import { toCardItem } from '../../../lib/figma-data';
import EventDetailClient, { GALLERY_PAGE_SIZE } from '../../../components/EventDetailClient';

export const revalidate = 60;

export async function generateMetadata(props) {
  const params = await props.params;
  const { data } = await getJSON('/events?limit=200&include_empty=1').catch(() => ({ data: [] }));
  const raw = (data || []).find((e) => (e.slug || e.id) === params.slug);
  if (!raw) return { title: 'Event not found' };
  const place = [raw.venue, raw.region].filter(Boolean).join(', ');
  const title = `${raw.name} photos`;
  const description = `Buy official photos and reels from ${raw.name}${place ? ` at ${place}` : ''} — find your ride by horse or rider.`;
  return { title, description, openGraph: { title, description } };
}

export default async function EventPage(props) {
  const params = await props.params;
  const { data } = await getJSON('/events?limit=200').catch(() => ({ data: [] }));
  const raw = (data || []).find((e) => (e.slug || e.id) === params.slug);
  if (!raw) notFound();
  // First page + filter options only; the gallery pages the rest with a cursor.
  const [first, facets] = await Promise.all([
    getJSON(`/photos?event_id=${raw.id}&limit=${GALLERY_PAGE_SIZE}`).catch(() => ({ data: [], next_cursor: null })),
    getJSON(`/photos/facets?event_id=${raw.id}`).then((j) => j.data).catch(() => null),
  ]);
  return <EventDetailClient event={toCardItem(raw, 0)} initial={first} facets={facets} />;
}
