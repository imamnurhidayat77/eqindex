import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJSON } from '../../../lib/api';
import { toCardItem } from '../../../lib/figma-data';
import EventDetailClient from '../../../components/EventDetailClient';

export const revalidate = 60;

export default async function EventPage({ params }) {
  const { data } = await getJSON('/events?limit=200').catch(() => ({ data: [] }));
  const raw = (data || []).find((e) => (e.slug || e.id) === params.slug);
  if (!raw) notFound();
  const { data: photos } = await getJSON(`/photos?event_id=${raw.id}&limit=200`).catch(() => ({ data: [] }));
  return <EventDetailClient event={toCardItem(raw, 0)} media={photos || []} />;
}
