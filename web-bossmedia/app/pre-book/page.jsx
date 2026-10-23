import { getJSON } from '../../lib/api';
import PreBookClient from '../../components/PreBookClient';

export const revalidate = 60;

export default async function PreBookPage() {
  const [{ data: events }, { data: products }] = await Promise.all([
    getJSON('/events?upcoming=1&limit=200').catch(() => ({ data: [] })),
    getJSON('/api/reel-products').catch(() => ({ data: [] })),
  ]);
  return <PreBookClient events={events || []} products={products || []} />;
}
