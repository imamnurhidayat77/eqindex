import { redirect } from 'next/navigation';
import { BOSSMEDIA_URL } from '../../lib/bossmedia';

// Reels live on Boss Media now.
export default function ReelsRedirect() {
  redirect(`${BOSSMEDIA_URL}/reels`);
}
