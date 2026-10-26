import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJSON } from '../../../lib/api';
import { toCardItem } from '../../../lib/figma-data';
import EventDetailClient from '../../../components/EventDetailClient';

export const revalidate = 60;

export async function generateMetadata({ params }) {
  const { data } = await getJSON('/events?limit=200&include_empty=1').catch(() => ({ data: [] }));
  const raw = (data || []).find((e) => (e.slug || e.id) === params.slug);
  if (!raw) return { title: 'Event not found' };
  const place = [raw.venue, raw.region].filter(Boolean).join(', ');
  const title = `${raw.name} photos`;
  const description = `Buy official photos and reels from ${raw.name}${place ? ` at ${place}` : ''} — find your ride by horse or rider.`;
  return { title, description, openGraph: { title, description } };
}

export default async function EventPage({ params }) {
  const { data } = await getJSON('/events?limit=200').catch(() => ({ data: [] }));
  const raw = (data || []).find((e) => (e.slug || e.id) === params.slug);
  if (!raw) notFound();
  const { data: photos } = await getJSON(`/photos?event_id=${raw.id}&limit=200`).catch(() => ({ data: [] }));
  return <EventDetailClient event={toCardItem(raw, 0)} media={photos || []} />;
}
