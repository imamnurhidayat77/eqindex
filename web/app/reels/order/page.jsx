import { redirect } from 'next/navigation';
import { BOSSMEDIA_URL } from '../../../lib/bossmedia';

// Reel orders are pre-booked on Boss Media now.
export default function ReelOrderRedirect() {
  redirect(`${BOSSMEDIA_URL}/pre-book`);
}
