import { WatchlistSk } from '../../components/Skeletons';

// Redirects to /watchlist — show its skeleton in case the redirect suspends.
export default function Loading() {
  return <WatchlistSk />;
}
