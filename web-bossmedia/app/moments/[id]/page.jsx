import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJSON } from '../../../lib/api';
import { SiteFooter, SiteHeader } from '../../../components/figma';
import SmartImage from '../../../components/SmartImage';
import ReelPlayer from '../../../components/ReelPlayer';
import MomentsActions from '../../../components/MomentsActions';
import { momentTitle } from '../../../lib/moment-share.mjs';
import { fmtDay } from '../../../lib/format';
import s from './moment.module.css';

export const revalidate = 30;

export async function generateMetadata(props) {
  const params = await props.params;
  const res = await getJSON(`/api/moments/${params.id}`).catch(() => null);
  const d = res?.data;
  if (!d) return { title: 'Moment not found' };
  const who = momentTitle(d);
  return {
    title: `${who} — ${d.event_name || 'a New Zealand show'}`,
    description: `A spectator-shared community moment${d.event_name ? ` from ${d.event_name}` : ''} — free to view. Sponsors can license it for reposting.`,
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
export default async function MomentDetail(props) {
  const params = await props.params;
  const res = await getJSON(`/api/moments/${params.id}`).catch(() => null);
  const d = res?.data;
  if (!d) notFound();
  const who = momentTitle(d);
  const date = d.created_at ? fmtDay(d.created_at) : null;
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
            <p className={s.sub}>{[d.event_name || 'A spectator-shared snapshot', date].filter(Boolean).join(' · ')}</p>
            <p className={s.note}>Free to view. Sponsors can license it for reposting.</p>
          </div>
        </div>
        {(prev || next) && (
          <nav className="media-neighbors" aria-label="Browse this event's moments">
            {prev
              ? <Link href={`/moments/${prev}`} className={s.neighbor}><span aria-hidden="true">←</span> Prev</Link>
              : <span />}
            <span>{index} of {total}</span>
            {next
              ? <Link href={`/moments/${next}`} className={s.neighbor}>Next <span aria-hidden="true">→</span></Link>
              : <span />}
          </nav>
        )}
        <div className="media-purchase-layout">
          <div className={`media-preview-column ${s.column}`}>
            {d.kind === 'reel' && d.preview_url ? (
              <ReelPlayer src={d.preview_url} poster={d.thumb_url || null} label="Community moment" />
            ) : (d.preview_url || d.thumb_url) ? (
              <figure className={s.stage}>
                <SmartImage src={d.preview_url || d.thumb_url} alt={who}
                  width={d.width || 1600} height={d.height || 1000} sizes="(max-width: 1100px) 100vw, 60vw" priority />
              </figure>
            ) : null}
          </div>
          <aside className="purchase-panel" aria-label="About this moment">
            <MomentsActions id={d.id} horseId={d.horse_id} riderId={d.rider_id} horse={d.horse} rider={d.rider} eventId={d.event_id} eventName={d.event_name} kind={d.kind} thumb={d.preview_url || d.thumb_url || null}>
              <h2 className="purchase-label">Details</h2>
              <dl className={s.details}>
                <div>
                  <dt>Event</dt>
                  <dd>{d.event_slug
                    ? <Link href={`/events/${d.event_slug}`} className={s.eventLink}>{d.event_name}</Link>
                    : (d.event_name || '—')}</dd>
                </div>
                {d.rider && <div><dt>Rider</dt><dd>{d.rider}</dd></div>}
                {d.horse && <div><dt>Horse</dt><dd>{d.horse}</dd></div>}
                {d.class_name && <div><dt>Class</dt><dd>{d.class_name}</dd></div>}
                {date && <div><dt>Shared</dt><dd>{date}</dd></div>}
                <div><dt>Shared by</dt><dd>A spectator · <span className="st-chip">Community</span></dd></div>
              </dl>
            </MomentsActions>
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
