import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJSON } from '../../../lib/api';
import { CARD, H1, SUB } from '../../../lib/tokens';
import BuyBox from '../../../components/BuyBox';
import PackageUpsell from '../../../components/PackageUpsell';
import ClaimButton from '../../../components/ClaimButton';
import CreditBuyButton from '../../../components/CreditBuyButton';
import TakedownButton from '../../../components/TakedownButton';
import MomentBundle from '../../../components/MomentBundle';
import ReelPlayer from '../../../components/ReelPlayer';
import PhotoViewer from '../../../components/PhotoViewer';
import ShareCard from '../../../components/ShareCard';

export const revalidate = 30;

const MOMENT = {
  win: '🏆 Win', clear: '✨ Clear round', debut: '🌟 Debut', pb: '⚡ PB',
};

const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(v || ''));

// Event photo wall: /photos/<event-slug>. Same shop cards as the gallery,
// scoped to one event. UUIDs still land on the photo detail below.
async function EventWall({ event, kind }) {
  const qp = new URLSearchParams({ event_id: event.id, limit: '96' });
  if (['photo', 'reel'].includes(kind)) qp.set('kind', kind);
  const r = await getJSON(`/photos?${qp}`).catch(() => ({ data: [] }));
  const rows = r.data || [];
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1.5 text-[12px] text-faint">
        <Link href="/photos" className="text-muted hover:text-white no-underline">Photos</Link>
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
        <Link href="/photos" className="text-sky text-[13px] no-underline hover:underline">← All events</Link>
      </div>
      <p className={SUB}>
        {[event.venue, (event.date_start || '').slice(0, 10)].filter(Boolean).join(' · ') || 'Event photos'} — watermarked previews, full resolution after purchase.
      </p>
      {!rows.length ? (
        <section className={CARD}>
          <div className="flex flex-col items-center py-10 text-center">
            <h2 className="mt-3 text-[16px] font-bold text-white">No photos here yet</h2>
            <p className="mt-1 text-[13px] text-muted">New photos land here after publishing.</p>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {rows.map((x) => (
            <Link key={x.id} href={`/photos/${x.id}`} className="group flex flex-col rounded-xl border border-line bg-card overflow-hidden no-underline hover:border-gold/50 transition">
              <div className="relative aspect-[4/3] bg-card2 flex items-center justify-center overflow-hidden">
                {x.thumb_url || x.preview_url
                  ? <img src={x.thumb_url || x.preview_url} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.03] transition duration-300" />
                  : <span className="text-xl">📷</span>}
                {x.kind === 'reel' && (
                  <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white">▶ Reel</span>
                )}
                {x.moment && MOMENT[x.moment] && (
                  <span className="absolute right-2 top-2 rounded-full bg-goldbg/80 px-2 py-0.5 text-[10.5px] font-bold text-gold">{MOMENT[x.moment]}</span>
                )}
              </div>
              <div className="flex grow flex-col gap-0.5 p-2.5">
                <div className="text-[13px] font-bold text-white truncate group-hover:text-gold transition">
                  {[x.horse, x.rider].filter(Boolean).join(' × ') || x.event_name || 'Untagged'}
                </div>
                <div className="text-[11px] text-faint truncate">{x.class_name || ''}</div>
                <div className="mt-auto flex items-center justify-between pt-1">
                  <span className="text-[11px] text-faint">{x.kind === 'reel' ? 'Video' : 'Photo'}</span>
                  {x.price_cents !== null && x.price_cents !== undefined && (
                    <span className="text-[12px] font-bold text-gold tabular-nums">from NZ${(Number(x.price_cents) / 100).toFixed(2)}</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export default async function PhotoDetail({ params, searchParams }) {
  if (!isUuid(params.id)) {
    const ev = await getJSON(`/events/${params.id}`).catch(() => null);
    if (ev?.data) return <EventWall event={ev.data} kind={searchParams?.kind || ''} />;
    // Non-UUID that isn't an event slug can never be a photo id
    // (photo ids are UUIDs) — 404 directly instead of querying.
    notFound();
  }
  const res = await getJSON(`/photos/${params.id}`).catch(() => null);
  if (!res?.data) notFound();
  const d = res.data;
  const horseTitle = d.horse_id
    ? <Link href={`/horses/${d.horse_id}`} className="hover:text-gold hover:underline">{d.horse}</Link>
    : d.horse;
  const riderTitle = d.rider_id
    ? <Link href={`/riders/${d.rider_id}`} className="hover:text-gold hover:underline">{d.rider}</Link>
    : d.rider;
  const hasTitle = d.horse || d.rider;
  const title = [d.horse, d.rider].filter(Boolean).join(' × ') || d.event_name || 'Photo';

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1.5 text-[12px] text-faint">
        <Link href="/photos" className="text-muted hover:text-white no-underline">Photos</Link>
        <span aria-hidden="true">/</span>
        {d.event_id && d.event_name
          ? <Link href={`/events/${d.event_id}`} className="text-muted hover:text-white no-underline truncate max-w-[220px]">{d.event_name}</Link>
          : <span>{d.event_name || 'Event'}</span>}
        <span aria-hidden="true">/</span>
        <span className="text-gold font-semibold">{d.kind === 'reel' ? 'Reel' : 'Photo'}</span>
      </nav>

      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className={`${H1} !mb-0`}>
          {hasTitle ? <>{horseTitle}{d.horse && d.rider ? ' × ' : ''}{riderTitle}</> : title}
        </h1>
        {d.moment && MOMENT[d.moment] && (
          <span className="inline-block text-[11px] font-bold rounded-md px-2 py-[3px] bg-goldbg text-gold">
            {MOMENT[d.moment]}
          </span>
        )}
      </div>
      <p className={SUB}>{d.event_name || ''}{d.class_name ? ` · ${d.class_name}` : ''}</p>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr] items-start">
        <section className="bg-card border border-line rounded overflow-hidden lg:mb-0">
          {d.kind === 'reel' ? (
            <ReelPlayer previewUrl={d.preview_url} posterUrl={d.thumb_url} title={title} />
          ) : (
            <PhotoViewer src={d.preview_url} alt={title} width={d.width} height={d.height} />
          )}
          <div className="px-5 py-4">
            <p className="text-[11px] text-faint">Watermarked preview — full resolution unlocks after purchase.</p>
            <ClaimButton mediaId={d.id} />
            <TakedownButton mediaId={d.id} />
            <ShareCard title={title} text={`${d.event_name || ''}${d.class_name ? ` · ${d.class_name}` : ''}`} />
          </div>
        </section>
        <div className="lg:sticky lg:top-[76px]">
          <section className={CARD} style={{ marginBottom: 0 }}>
            <div className="text-[11px] uppercase tracking-wide text-faint font-bold mb-2">Details</div>
            <dl className="text-[13px] space-y-2">
              {[
                ['Event', d.event_name || '—'],
                ['Class', d.class_name || '—'],
                ['Date', (d.taken_at || d.event_date || '').slice(0, 10) || '—'],
                ['Photographer', d.photographer || '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-rowline last:border-0 pb-2">
                  <dt className="text-muted">{k}</dt>
                  <dd className="font-semibold text-right">
                    {k === 'Event' && d.event_id
                      ? <Link href={`/events/${d.event_id}`} className="text-sky hover:underline">{v}</Link> : v}
                  </dd>
                </div>
              ))}
            </dl>
            <BuyBox id={d.id} tier={d.license_default} tierLabel={d.tier_label} />
            {d.event_id && d.horse_id && (
              <PackageUpsell eventId={d.event_id} horseId={d.horse_id} riderId={null} horse={d.horse} rider={d.rider} />
            )}
            {d.event_id && d.rider_id && (
              <PackageUpsell eventId={d.event_id} horseId={null} riderId={d.rider_id} horse={d.horse} rider={d.rider} />
            )}
            {d.event_id && (d.rider_id || d.horse_id) && (
              <CreditBuyButton eventId={d.event_id}
                horseId={d.rider_id ? null : d.horse_id}
                riderId={d.rider_id || null} />
            )}
            <MomentBundle eventId={d.event_id} horseId={d.horse_id} riderId={d.rider_id} currentId={d.id} currentKind={d.kind} />
          </section>
        </div>
      </div>
    </>
  );
}
