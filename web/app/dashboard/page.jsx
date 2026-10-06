import { redirect } from 'next/navigation';

// The Dashboard is your watchlists — the old analytics view lives on
// in git history; all dashboard traffic goes to the watchlist.
export default function Dashboard() {
  redirect('/watchlist');
}
