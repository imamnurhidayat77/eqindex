import { redirect } from 'next/navigation';
import { BOSSMEDIA_URL } from '../../../lib/bossmedia';

// Buyer libraries moved to Boss Media.
export default function PhotoLibraryRedirect() {
  redirect(`${BOSSMEDIA_URL}/media`);
}
