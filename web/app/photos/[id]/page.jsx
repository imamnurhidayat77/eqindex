import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getJSON } from '../../../lib/api';
import { H1, SUB } from '../../../lib/tokens';
import { BOSSMEDIA_URL, bossPhotoUrl } from '../../../lib/bossmedia';
import EventWallGrid from '../../../components/EventWallGrid';

export const revalidate = 30;

const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(v || ''));

// Event photo wall: /photos/<event-slug>. Display only — every card opens
// the photo on Boss Media in a new tab, where buying happens.
async function EventWall({ event, kind }) {
  const qp = new URLSearchParams({ event_id: event.id, limit: '48' });
  if (['photo', 'reel'].includes(kind)) qp.set('kind', kind);
  const r = await getJSON(`/photos?${qp}`).catch(() => ({ data: [] }));
  const rows = r.data || [];
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1.5 text-[12px] text-faint">
        <Link href="/events" className="text-muted hover:text-white no-underline">Events</Link>
        <span aria-hidden="true">/</span>
        <span className="text-gold font-semibold truncate max-w-[280px]">{event.name}</span>
      </nav>
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className={`${H1} !mb-0`}>{event.name}</h1>
        {!!rows.length && (
          <span className="rounded-full border border-line px-2.5 py-1 text-[12px] font-bold text-muted">
            {rows.length} photo{rows.length > 1 ? 's' : ''}
          </span>
        )}
        <span className="flex-1" />
        <Link href="/events" className="text-sky text-[13px] no-underline hover:underline">← All events</Link>
      </div>
      <p className={SUB}>
        {[event.venue, (event.date_start || '').slice(0, 10)].filter(Boolean).join(' · ') || 'Event photos'} — watermarked previews.{' '}
        <a href={`${BOSSMEDIA_URL}/photos`} target="_blank" rel="noreferrer" className="text-sky no-underline hover:underline">
          View and buy full resolution on Boss Media →
        </a>
      </p>
      {!rows.length ? (
        <section className="rounded-lg border border-line bg-card">
          <div className="flex flex-col items-center py-10 text-center">
            <h2 className="mt-3 text-[16px] font-bold text-white">No photos here yet</h2>
            <p className="mt-1 text-[13px] text-muted">New photos land here after publishing.</p>
          </div>
        </section>
      ) : (
        <EventWallGrid initialRows={rows} eventId={event.id} kind={['photo', 'reel'].includes(kind) ? kind : ''} />
      )}
    </>
  );
}

export default async function PhotoRoute({ params, searchParams }) {
  // Photo/reel detail lives on Boss Media now — send buyers straight there.
  if (isUuid(params.id)) redirect(bossPhotoUrl(params.id));
  const ev = await getJSON(`/events/${params.id}`).catch(() => null);
  if (ev?.data) return <EventWall event={ev.data} kind={searchParams?.kind || ''} />;
  // Non-UUID that isn't an event slug can never be a photo id
  // (photo ids are UUIDs) — 404 directly instead of querying.
  notFound();
}
