import { redirect } from 'next/navigation';

// License tiers, packages and reel prices are managed in Boss Media studio now.
export default function AdminPricingRedirect() {
  redirect('/admin');
}
