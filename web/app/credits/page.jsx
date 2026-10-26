import { redirect } from 'next/navigation';
import { BOSSMEDIA_URL } from '../../lib/bossmedia';

// Credit packs moved to the Boss Media library.
export default function CreditsRedirect() {
  redirect(`${BOSSMEDIA_URL}/media`);
}
