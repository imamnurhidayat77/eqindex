import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJSON } from '../../../lib/api';
import { CARD, H1, SUB } from '../../../lib/tokens';

export const revalidate = 30;

const nzd = (c) => (c === null || c === undefined ? '—' : `$${(Number(c) / 100).toFixed(2)}`);

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
              ? <img src={d.preview_url} alt={title} className="w-full h-auto" />
              : <span className="text-4xl py-16">{d.kind === 'reel' ? '🎬' : '📷'}</span>}
          </div>
          <p className="text-[11px] text-faint mt-2">Watermarked preview — full resolution unlocks after purchase.</p>
        </section>
        <section className={CARD}>
          <div className="text-[11px] uppercase tracking-wide text-faint font-bold mb-2">Details</div>
          <dl className="text-[13px] space-y-2">
            {[
              ['Event', d.event_name || '—'],
              ['Class', d.class_name || '—'],
              ['Date', (d.taken_at || d.event_date || '').slice(0, 10) || '—'],
              ['Moment', d.moment || '—'],
              ['Price', nzd(d.price_cents)],
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
          <div className="mt-4 rounded border border-line bg-card2 p-3 text-[13px] text-muted">
            Online purchase opens at launch — this preview is not yet for sale.
          </div>
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
                    ? <img src={x.thumb_url} alt="" loading="lazy" className="w-full h-full object-cover" />
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
