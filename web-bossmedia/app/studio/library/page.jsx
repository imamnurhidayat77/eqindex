import { getJSON } from '../../../lib/api';
import LibraryClient from '../../../components/LibraryClient';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Library', robots: { index: false } };

export default async function LibraryPage({ searchParams }) {
  const { data } = await getJSON('/events?limit=200').catch(() => ({ data: [] }));
  return (
    <LibraryClient
      events={data || []}
      initial={{ status: searchParams?.status || '', event_id: searchParams?.event_id || '', kind: searchParams?.kind || '', untagged: searchParams?.untagged === '1' }}
    />
  );
}
