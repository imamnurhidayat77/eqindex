import Link from 'next/link';
import { BTN, BTN_PRIMARY } from '../lib/tokens';

export const metadata = { title: 'Page not found' };

// Shown for unknown URLs and whenever a detail page calls notFound()
// (horse, rider, event, stallion or breeder the API doesn't know).
export default function NotFound() {
  return (
    <section className="mx-auto flex max-w-[520px] flex-col items-center px-4 py-16 text-center">
      <span aria-hidden="true" className="font-display text-[56px] font-bold leading-none text-gold/80">404</span>
      <h1 className="mt-4 font-display text-[22px] font-bold uppercase tracking-tight text-white">Page not found</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">
        This horse, rider or event may have been renamed, merged or removed, or the link is mistyped.
        Try searching, or start from one of the lists below.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/" className={`${BTN_PRIMARY} no-underline`}>Go to home</Link>
        <Link href="/horses" className={`${BTN} no-underline`}>Horses</Link>
        <Link href="/riders" className={`${BTN} no-underline`}>Riders</Link>
        <Link href="/events" className={`${BTN} no-underline`}>Events</Link>
      </div>
    </section>
  );
}
