'use client';
import { BOSSMEDIA_URL, bossEventUrl, bossPhotosUrl } from '../lib/bossmedia';
import { CARD, BTN_PRIMARY } from '../lib/tokens';

// Single media doorway for data pages (event / horse / rider profiles).
// IA rule: data pages never sell inline — they link out to the Boss Media
// shop in a new tab. Photos go to the shop, reels to pre-book.
export default function MediaDoorway({
  eventId, eventSlug, eventName,
  horseId, horseSlug, horseName,
  riderId, riderSlug, riderName,
}) {
  let photosHref = `${BOSSMEDIA_URL}/photos`;
  if (eventSlug || eventId) photosHref = bossEventUrl(eventSlug || eventId);
  else if (horseName || horseSlug || horseId) photosHref = bossPhotosUrl({ q: horseName || horseSlug || horseId });
  else if (riderName || riderSlug || riderId) photosHref = bossPhotosUrl({ q: riderName || riderSlug || riderId });

  const reelsHref = `${BOSSMEDIA_URL}/pre-book`;

  return (
    <section className={CARD}>
      <h2 className="text-[15px] font-bold">📷 Photos &amp; video</h2>
      <p className="mt-0.5 mb-3 text-[12.5px] text-muted">
        Relive the moment — browse the photo gallery or order a custom video reel on Boss Media.
      </p>
      <div className="flex flex-wrap gap-2">
        <a href={photosHref} target="_blank" rel="noreferrer" className="text-sky text-[13px] no-underline hover:underline border border-line rounded px-4 py-2">
          Browse photos →
        </a>
        <a href={reelsHref} target="_blank" rel="noreferrer" className={`${BTN_PRIMARY} no-underline`}>
          Order a reel →
        </a>
      </div>
    </section>
  );
}
