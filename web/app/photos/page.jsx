import { redirect } from 'next/navigation';
import { bossPhotosUrl } from '../../lib/bossmedia';

// The EQIndex gallery now lives on Boss Media — keep any filtered view
// working by passing the same query through.
export default function PhotosRedirect({ searchParams }) {
  const sp = searchParams || {};
  redirect(bossPhotosUrl({
    ...(sp.kind ? { kind: sp.kind } : {}),
    ...(sp.horse ? { horse: sp.horse } : {}),
    ...(sp.rider ? { rider: sp.rider } : {}),
    ...(sp.event ? { event: sp.event } : {}),
    ...(sp.q ? { q: sp.q } : {}),
  }));
}
