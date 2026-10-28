import { getJSON } from '../../../lib/api';
import PricingClient from '../../../components/PricingClient';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Pricing', robots: { index: false } };

export default async function PricingPage() {
  const { data } = await getJSON('/events?limit=200').catch(() => ({ data: [] }));
  return <PricingClient events={data || []} />;
}
