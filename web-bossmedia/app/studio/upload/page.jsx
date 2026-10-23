import { getJSON } from '../../../lib/api';
import UploadClient from '../../../components/UploadClient';

export const dynamic = 'force-dynamic';

export default async function UploadPage() {
  const { data } = await getJSON('/events?limit=200').catch(() => ({ data: [] }));
  return <UploadClient events={data || []} />;
}
