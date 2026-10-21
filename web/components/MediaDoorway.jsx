'use client';
import Link from 'next/link';
import { CARD, BTN_PRIMARY } from '../lib/tokens';

// Single commerce doorway for data pages (event / horse / rider profiles).
// IA rule: data pages never sell inline — they link out to the shop.
// Photos go to the gallery, reels to the order form. No prices here;
// buying happens on the photo detail page and the reels checkout.
export default function MediaDoorway({
  eventId, eventSlug, eventName,
  horseId, horseSlug, horseName,
  riderId, riderSlug, riderName,
}) {
  const subject = eventName || horseName || riderName || '';
  const eq = (v) => encodeURIComponent(v);

  let photosHref = '/photos';
  if (eventId || eventSlug) photosHref = `/photos?event=${eq(eventSlug || eventId)}`;
  else if (horseId || horseSlug) photosHref = `/photos?horse=${eq(horseSlug || horseId)}`;
  else if (riderId || riderSlug) photosHref = `/photos?rider=${eq(riderSlug || riderId)}`;

  let reelsHref = '/reels/order';
  if (eventId || eventSlug) reelsHref = `/reels/order?event=${eq(eventSlug || eventId)}`;

  return (
    <section className={CARD}>
      <h2 className="text-[15px] font-bold">📷 Photos &amp; video</h2>
      <p className="mt-0.5 mb-3 text-[12.5px] text-muted">
        Results above are free{subject ? ` — photos and custom reels from ${subject} are sold separately` : ' — photos and custom reels are sold separately'}.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href={photosHref} className="text-sky text-[13px] no-underline hover:underline border border-line rounded px-4 py-2">
          Browse photos →
        </Link>
        <Link href={reelsHref} className={`${BTN_PRIMARY} no-underline`}>
          Order a reel →
        </Link>
      </div>
    </section>
  );
}
