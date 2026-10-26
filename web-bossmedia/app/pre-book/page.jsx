import { getJSON } from '../../lib/api';
import PreBookClient from '../../components/PreBookClient';

export const metadata = {
  title: 'Pre-book coverage',
  description: 'Book a dedicated photographer before your event: stills and reels from every round.',
};

export default async function PreBookPage() {
  const [{ data: events }, { data: products }] = await Promise.all([
    getJSON('/events?prebook=1&limit=200').catch(() => ({ data: [] })),
    getJSON('/api/reel-products').catch(() => ({ data: [] })),
  ]);
  return <PreBookClient events={events || []} products={products || []} />;
}
