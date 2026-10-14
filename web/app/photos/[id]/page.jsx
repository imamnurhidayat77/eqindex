import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJSON } from '../../../lib/api';
import { CARD, H1, SUB } from '../../../lib/tokens';
import BuyBox from '../../../components/BuyBox';
import PackageUpsell from '../../../components/PackageUpsell';
import PhotoViewer from '../../../components/PhotoViewer';
import ProtectedImage from '../../../components/ProtectedImage';
import ShareCard from '../../../components/ShareCard';

export const revalidate = 30;

const nzd = (c) => (c === null || c === undefined ? null : `NZ$${(Number(c) / 100).toFixed(2)}`);
const MOMENT = {
  win: '🏆 Win', clear: '✨ Clear round', debut: '🌟 Debut', pb: '⚡ PB',
};

export default async function PhotoDetail({ params }) {
  const res = await getJSON(`/photos/${params.id}`).catch(() => null);
  if (!res?.data) notFound();
  const d = res.data;
  const related = res.related || [];
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
          <PhotoViewer src={d.preview_url} alt={title} width={d.width} height={d.height} />
          <div className="px-5 py-4">
            <p className="text-[11px] text-faint">Watermarked preview — full resolution unlocks after purchase.</p>
            <ShareCard title={title} text={`${d.event_name || ''}${d.class_name ? ` · ${d.class_name}` : ''}`} />
          </div>
        </section>
        <div className="lg:sticky lg:top-[76px] lg:row-span-2">
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
            <PackageUpsell eventId={d.event_id} horseId={d.horse_id} riderId={d.rider_id} horse={d.horse} rider={d.rider} />
          </section>
        </div>
        {!!related.length && (
          <div className="min-w-0">
            <div className="mt-2 lg:mt-0 mb-2.5 flex items-center gap-2.5">
              <h2 className="text-[15px] font-bold">Related photos</h2>
              <span className="rounded-full border border-line px-2 py-px text-[11px] font-bold text-muted">{related.length}</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-3">
              {related.map((x) => {
                const price = nzd(x.price_cents);
                const caption = [x.horse, x.rider].filter(Boolean).join(' × ') || 'Photo';
                return (
                  <Link key={x.id} href={`/photos/${x.id}`}
                    className="group flex flex-col rounded-xl border border-line bg-card overflow-hidden no-underline hover:border-gold/50 transition">
                    <div className="aspect-[4/3] bg-card2 flex items-center justify-center overflow-hidden">
                      {x.thumb_url
                        ? <ProtectedImage src={x.thumb_url} alt={caption} loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.04] transition duration-300" />
                        : <span className="text-2xl">{x.kind === 'reel' ? '🎬' : '📷'}</span>}
                    </div>
                    <div className="flex items-center justify-between gap-2 p-2">
                      <span className="text-[12px] font-bold text-white truncate group-hover:text-gold transition">{caption}</span>
                      {price && <span className="shrink-0 text-[11.5px] font-bold text-gold tabular-nums">from {price}</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
