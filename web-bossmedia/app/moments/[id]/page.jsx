import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJSON } from '../../../lib/api';
import { SiteFooter, SiteHeader } from '../../../components/figma';
import SmartImage from '../../../components/SmartImage';
import ReelPlayer from '../../../components/ReelPlayer';
import MomentsActions from '../../../components/MomentsActions';

export const revalidate = 30;

export async function generateMetadata({ params }) {
  const res = await getJSON(`/api/moments/${params.id}`).catch(() => null);
  const d = res?.data;
  if (!d) return { title: 'Moment not found' };
  const who = [d.horse, d.rider].filter(Boolean).join(' × ') || 'Community moment';
  return {
    title: `${who} — ${d.event_name || 'a New Zealand show'}`,
    description: `A spectator-shared community moment${d.event_name ? ` from ${d.event_name}` : ''} — free to view, never for sale.`,
    openGraph: {
      title: who,
      description: 'Shared by a spectator on Boss Media.',
      images: d.preview_url || d.thumb_url ? [{ url: d.preview_url || d.thumb_url }] : undefined,
    },
  };
}

// Same editorial skeleton as the buy page (breadcrumb → title → preview +
// sticky rail), minus commerce: the rail carries context + follows instead
// of licenses + cart. Kinship without confusion.
export default async function MomentDetail({ params }) {
  const res = await getJSON(`/api/moments/${params.id}`).catch(() => null);
  const d = res?.data;
  if (!d) notFound();
  const who = [d.horse, d.rider].filter(Boolean).join(' × ') || 'Untagged moment';
  // Siblings for prev/next browsing (same event, oldest first like the shop).
  // One extra fetch, no new endpoint: moment volumes per event stay small.
  let prev = null, next = null, index = 0, total = 1;
  if (d.event_id) {
    const sib = await getJSON(`/api/moments?event_id=${d.event_id}&limit=200`).catch(() => null);
    const ids = (Array.isArray(sib?.data) ? sib.data : []).map((m) => m.id).reverse();
    const i = ids.indexOf(d.id);
    if (i >= 0) {
      index = i + 1; total = ids.length;
      prev = ids[i - 1] || null; next = ids[i + 1] || null;
    }
  }
  return (
    <div className="media-detail-page">
      <SiteHeader />
      <main className="media-purchase section-gutter">
        <div className="media-purchase-breadcrumb">
          <Link href="/events">Event galleries</Link>
          <span aria-hidden="true">/</span>
          {d.event_slug
            ? <Link href={`/events/${d.event_slug}`}>{d.event_name}</Link>
            : <strong>{d.event_name || 'Community moment'}</strong>}
          <span aria-hidden="true">/</span>
          <strong>Community moment</strong>
        </div>
        <div className="media-purchase-title">
          <div>
            <p className="eyebrow">Community moment</p>
            <h1>{who}</h1>
            <p>{d.event_name || 'A spectator-shared snapshot'} · Free to view, never for sale</p>
          </div>
        </div>
        {(prev || next) && (
          <nav className="media-neighbors" aria-label="Browse this event's moments">
            {prev
              ? <Link href={`/moments/${prev}`} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, color: '#aaa', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', textDecoration: 'none' }}><span aria-hidden="true">←</span> Prev</Link>
              : <span />}
            <span>{index} of {total}</span>
            {next
              ? <Link href={`/moments/${next}`} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, color: '#aaa', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', textDecoration: 'none' }}>Next <span aria-hidden="true">→</span></Link>
              : <span />}
          </nav>
        )}
        <div className="media-purchase-layout">
          <div className="media-preview-column">
            {d.kind === 'reel' && d.preview_url ? (
              <ReelPlayer src={d.preview_url} poster={d.thumb_url || null} label="Community moment" />
            ) : (d.preview_url || d.thumb_url) ? (
              <figure className="purchase-preview">
                <SmartImage src={d.preview_url || d.thumb_url} alt={[d.horse, d.rider].filter(Boolean).join(' and ') || 'Community moment photo'}
                  width={d.width || 1600} height={d.height || 1000} sizes="(max-width: 1100px) 100vw, 60vw" />
                <figcaption style={{
                  background: 'linear-gradient(transparent, rgba(0,0,0,.55))',
                  padding: '34px 17px 13px', left: 0, right: 0, bottom: 0,
                }}>
                  <span>Community moment</span><span>{d.event_name || ''}</span>
                </figcaption>
              </figure>
            ) : null}
          </div>
          <aside className="purchase-panel" aria-label="About this moment">
            <h2 className="purchase-label">About this moment</h2>
            <div style={{ display: 'grid', gap: 10, fontSize: 13, color: '#bbb' }}>
              <div>
                <span style={{ color: '#777', display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.09em', marginBottom: 4 }}>Event</span>
                {d.event_slug
                  ? <Link href={`/events/${d.event_slug}`} style={{ color: '#fff', fontSize: 14, lineHeight: 1.5, overflowWrap: 'anywhere', textDecoration: 'none', borderBottom: '1px solid #444', paddingBottom: 1 }}>{d.event_name}</Link>
                  : (d.event_name || '—')}
              </div>
              {d.class_name && (
                <div>
                  <span style={{ color: '#777', display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.09em' }}>Class</span>
                  <span className="st-chip">{d.class_name}</span>
                </div>
              )}
              <div>
                <span style={{ color: '#777', display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.09em' }}>Shared by</span>
                A spectator · <span className="st-chip">Community</span>
              </div>
            </div>
            <h2 className="purchase-label" style={{ marginTop: 22 }}>Follow the story</h2>
            <MomentsActions id={d.id} horseId={d.horse_id} riderId={d.rider_id} horse={d.horse} rider={d.rider} eventId={d.event_id} eventName={d.event_name} />
          </aside>
        </div>
        <p style={{ marginTop: 26 }}>
          <Link href="/moments" className="text-link">More community moments →</Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
