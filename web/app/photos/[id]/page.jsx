import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJSON } from '../../../lib/api';
import { CARD, H1, SUB } from '../../../lib/tokens';
import BuyBox from '../../../components/BuyBox';
import PackageUpsell from '../../../components/PackageUpsell';
import ProtectedImage from '../../../components/ProtectedImage';
import ShareCard from '../../../components/ShareCard';

export const revalidate = 30;

export default async function PhotoDetail({ params }) {
  const res = await getJSON(`/photos/${params.id}`).catch(() => null);
  if (!res?.data) notFound();
  const d = res.data;
  const related = res.related || [];
  const title = [d.horse, d.rider].filter(Boolean).join(' × ') || d.event_name || 'Photo';

  return (
    <>
      <div className="mb-1 text-[12px] text-faint">
        <Link href="/photos" className="text-muted hover:text-white">Photos</Link>
        <span className="mx-1.5">/</span>
        <span className="text-gold">{d.kind === 'reel' ? 'Reel' : 'Photo'}</span>
      </div>
      <h1 className={H1}>{title}</h1>
      <p className={SUB}>{d.event_name || ''}{d.class_name ? ` · ${d.class_name}` : ''}</p>
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr] items-start">
        <section className={CARD}>
          <div className="rounded overflow-hidden bg-ink flex items-center justify-center min-h-[280px]">
            {d.preview_url
              ? <ProtectedImage src={d.preview_url} alt={title} className="w-full h-auto" />
              : <span className="text-4xl py-16">{d.kind === 'reel' ? '🎬' : '📷'}</span>}
          </div>
          <p className="text-[11px] text-faint mt-2">Watermarked preview — full resolution unlocks after purchase.</p>
          <ShareCard title={title} text={`${d.event_name || ''}${d.class_name ? ` · ${d.class_name}` : ''}`} />
        </section>
        <section className={CARD}>
          <div className="text-[11px] uppercase tracking-wide text-faint font-bold mb-2">Details</div>
          {d.moment && (
            <div className="mb-3"><span className="inline-block text-[11px] font-bold rounded-md px-2 py-[3px] bg-goldbg text-gold">
              {d.moment === 'win' ? '🏆 Win' : d.moment === 'clear' ? '✨ Clear round' : d.moment === 'debut' ? '🌟 Debut' : '⚡ PB'}
            </span></div>
          )}
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
        <>
          <h2 className="text-[15px] font-bold mt-6 mb-3">Related</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {related.map((x) => (
              <Link key={x.id} href={`/photos/${x.id}`} className="block rounded border border-line bg-card overflow-hidden no-underline hover:border-gold/50">
                <div className="aspect-[4/3] bg-card2 flex items-center justify-center overflow-hidden">
                  {x.thumb_url
                    ? <ProtectedImage src={x.thumb_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                    : <span className="text-2xl">{x.kind === 'reel' ? '🎬' : '📷'}</span>}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
