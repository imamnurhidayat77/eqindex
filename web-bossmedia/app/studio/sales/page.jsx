import { getJSON } from '../../../lib/api';
import SalesClient from '../../../components/SalesClient';

export const dynamic = 'force-dynamic';

export default async function SalesPage({ searchParams }) {
  const { data } = await getJSON('/events?limit=200').catch(() => ({ data: [] }));
  return <SalesClient events={data || []} initialStatus={searchParams?.status || ''} />;
}
