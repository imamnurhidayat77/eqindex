import { redirect } from 'next/navigation';
import { BOSSMEDIA_URL } from '../../../lib/bossmedia';

// Checkout happens on Boss Media now — its own success page handles receipts.
export default function PurchaseSuccessRedirect() {
  redirect(`${BOSSMEDIA_URL}/media`);
}
