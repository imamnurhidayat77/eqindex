import { galleryEvents } from '../../lib/figma-data';
import EventsClient from '../../components/EventsClient';

export const revalidate = 60;

export const metadata = {
  title: 'Event galleries',
  description: 'Every Boss Media event gallery: NZ showjumping photos and reels by horse and rider.',
};

export default async function EventsPage() {
  const items = await galleryEvents();
  const regions = [...new Set(items.map((it) => it.region).filter(Boolean))].sort();
  const years = [...new Set(items.map((it) => it.year).filter((y) => y && y !== '—'))].sort().reverse();
  return <EventsClient items={items} regions={regions} years={years} />;
}
