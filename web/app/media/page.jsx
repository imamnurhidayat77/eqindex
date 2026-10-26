import { redirect } from 'next/navigation';
import { BOSSMEDIA_URL } from '../../lib/bossmedia';

// My Media moved to Boss Media (library, reels, credits in one place).
export default function MediaRedirect() {
  redirect(`${BOSSMEDIA_URL}/media`);
}
