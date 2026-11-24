import Link from 'next/link';
import { getJSON } from '../../lib/api';
import PageShell from '../../components/PageShell';
import SmartImage from '../../components/SmartImage';
import { Icon } from '../../components/figma';

export const revalidate = 60;

export const metadata = { title: 'Community moments' };

const LIMIT = 24;

export default async function MomentsFeed(props) {
  const searchParams = await props.searchParams;
  const page = Math.max(1, parseInt(searchParams?.page, 10) || 1);
  const eventId = String(searchParams?.event_id || '');
  const q = new URLSearchParams({ limit: String(LIMIT + 1), offset: String((page - 1) * LIMIT) });
  if (eventId) q.set('event_id', eventId);
  const { data } = await getJSON(`/api/moments?${q}`).catch(() => ({ data: [] }));
  const all = Array.isArray(data) ? data : [];
  const items = all.slice(0, LIMIT);
  const hasMore = all.length > LIMIT;
  const eventName = eventId ? items[0]?.event_name || null : null;
  const pageHref = (n) => {
    const p = new URLSearchParams();
    if (eventId) p.set('event_id', eventId);
    if (n > 1) p.set('page', String(n));
    const s = p.toString();
    return `/moments${s ? `?${s}` : ''}`;
  };
  return (
    <PageShell eyebrow="Community" title={eventName ? `${eventName} moments.` : 'Moments.'} wide
      intro="Snapshots shared by spectators — free to view. Sponsors can license them for reposting. Official photos live in the event galleries.">
      {!items.length ? (
        <div className="event-media-empty">
          <p className="eyebrow">{page > 1 ? 'End of moments' : 'Nothing yet'}</p>
          <h3>{page > 1 ? 'You’ve seen them all.' : 'No community moments published.'}</h3>
          <p>{page > 1
            ? <Link href={pageHref(1)} className="primary-link">Back to the start</Link>
            : 'At an event? Email your photos in — the signage has the address.'}</p>
          {!eventId && page <= 1 && (
            <p style={{ marginTop: 18 }}>
              <Link href="/events" className="primary-link">Browse galleries</Link>
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="event-media-grid">
            {items.map((m) => (
              <Link className="event-media-card photo" key={m.id} href={`/moments/${m.id}`}
                aria-label={`${[m.horse, m.rider].filter(Boolean).join(' and ') || 'Community moment'}`}>
                {m.thumb_url || m.preview_url
                  ? <SmartImage src={m.thumb_url || m.preview_url} alt={[m.horse, m.rider].filter(Boolean).join(' and ') || 'Community moment photo'} width={800} height={600} sizes="(max-width: 768px) 100vw, 25vw" />
                  : <span className="cover-fallback">{m.kind === 'reel' ? 'Rendering…' : 'No preview'}</span>}
                {m.kind === 'reel' && <span className="media-kind">▶</span>}
                <span className="media-card-footer">
                  <small title={m.event_name || ''}>{m.event_name || '—'}</small>
                  <span className="media-card-title">
                    <strong>{[m.horse, m.rider].filter(Boolean).join(' × ') || 'Untagged moment'}</strong>
                    <Icon name="arrow" size={15} />
                  </span>
                </span>
              </Link>
            ))}
          </div>
          {(page > 1 || hasMore) && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 20 }}>
              {page > 1 && <Link href={pageHref(page - 1)} className="text-link">← Newer</Link>}
              <small style={{ color: '#777' }}>Page {page}</small>
              {hasMore && <Link href={pageHref(page + 1)} className="text-link">Older →</Link>}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
