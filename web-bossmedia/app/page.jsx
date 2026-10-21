import Link from 'next/link';
import { getJSON } from '../lib/api';
import Hero from '../components/Hero';
import MomentSearch from '../components/MomentSearch';
import FavButton from '../components/FavButton';

export const revalidate = 60;

const nzd = (c) => (c === null || c === undefined ? null : `NZ$${(Number(c) / 100).toFixed(2)}`);

function PhotoCard({ x }) {
  return (
    <Link href={`/p/${x.id}`} className="card photo-card" style={{ position: 'relative' }}>
      {x.kind === 'reel' && <span className="badge" style={{ position: 'absolute', top: 10, left: 10 }}>▶ REEL</span>}
      {x.thumb_url || x.preview_url
        ? <img src={x.thumb_url || x.preview_url} alt="" loading="lazy" />
        : <div style={{ aspectRatio: '4/3', display: 'grid', placeItems: 'center', background: '#eceae4' }} />}
      <FavButton id={x.id} />
      <div className="cap">
        <b>{[x.horse, x.rider].filter(Boolean).join(' × ') || x.event_name || 'Untagged'}</b>
        <span>{x.event_name || ''}</span>
      </div>
      <div className="row">
        <span>{x.kind === 'reel' ? 'Video' : 'Photo'}</span>
        {nzd(x.price_cents) && <span className="price">from {nzd(x.price_cents)}</span>}
      </div>
    </Link>
  );
}

export { PhotoCard };

export default async function Home() {
  const [{ data: photos }, { data: events }, { data: reels }] = await Promise.all([
    getJSON('/photos?limit=96').catch(() => ({ data: [] })),
    getJSON('/events?limit=8').catch(() => ({ data: [] })),
    getJSON('/photos?kind=reel&limit=4').catch(() => ({ data: [] })),
  ]);
  const rows = photos || [];
  const evs = (events || []).slice(0, 8);
  const firstEvent = rows[0]?.event_name || evs[0]?.name || '';
  const steps = [
    ['01 — Find your photos', 'Search your horse, rider, or event. Every file is tagged to the round it came from.'],
    ['02 — Pick a license or bundle', 'Single files from NZ$15, pick-any-5 packs, or the whole event in one bundle.'],
    ['03 — Download instantly', 'Watermark-free full resolution, re-downloadable forever from your account.'],
  ];
  return (
    <>
      <Hero photos={rows.slice(0, 8)} eventName={firstEvent} />

      <section style={{ marginBottom: 40 }}>
        <h2 className="section-title">Find your moment</h2>
        <p className="caption" style={{ margin: '0 0 14px' }}>Type a rider, horse, or event — we&apos;ll take you straight to the gallery.</p>
        <MomentSearch />
      </section>

      <section style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 className="section-title">Latest events</h2>
          <Link href="/events" style={{ color: '#1F3D2E', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>All events →</Link>
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {evs.map((e) => (
            <Link key={e.id} href={`/photos?event=${e.id}`} className="card" style={{ padding: 18, textDecoration: 'none' }}>
              <div className="caption num">{(e.date_start || '').slice(0, 10) || ''}</div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 20, margin: '6px 0' }}>{e.name}</div>
              <div className="caption">{[e.venue, e.region].filter(Boolean).join(' · ') || ''}</div>
            </Link>
          ))}
        </div>
        {!evs.length && <p className="caption">New event galleries land here after each show weekend.</p>}
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 className="section-title">How it works</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 0, marginTop: 14, borderTop: '2px solid #1C1C1A' }}>
          {steps.map(([t, d], i) => (
            <div key={t} style={{ padding: '18px 18px 4px 0', borderRight: i < 2 ? '1px solid #E7E2D8' : 'none', paddingLeft: i ? 18 : 0 }}>
              <div className="num" style={{ fontSize: 12, letterSpacing: 2, color: '#1F3D2E', fontWeight: 800 }}>{t.split(' — ')[0]}</div>
              <div style={{ fontWeight: 700, margin: '6px 0 4px' }}>{t.split(' — ')[1]}</div>
              <p className="caption" style={{ margin: 0 }}>{d}</p>
            </div>
          ))}
        </div>
      </section>

      {!!(reels || []).length && (
        <section style={{ background: '#141412', borderRadius: 16, padding: '32px 28px', marginBottom: 40, color: '#F6F6F4' }}>
          <h2 className="section-title" style={{ color: '#fff' }}>Custom reels</h2>
          <p className="caption" style={{ color: '#B9B9B4' }}>Personalised showreels capturing your round, professionally edited.</p>
          <div className="grid" style={{ marginTop: 16 }}>
            {reels.slice(0, 4).map((r) => (
              <Link key={r.id} href={`/p/${r.id}`} className="card" style={{ background: '#1E1E1C', borderColor: '#33332F' }}>
                {r.thumb_url || r.preview_url
                  ? <img src={r.thumb_url || r.preview_url} alt="" loading="lazy" />
                  : <div style={{ aspectRatio: '4/3', display: 'grid', placeItems: 'center' }}>▶</div>}
                <div className="cap">
                  <b style={{ color: '#fff' }}>{[r.horse, r.rider].filter(Boolean).join(' × ') || r.event_name || ''}</b>
                  <span style={{ color: '#B9B9B4' }}>{r.event_name || ''}</span>
                </div>
              </Link>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <Link href="/reels" className="btn btn-primary btn-md">Order your reel</Link>
          </div>
        </section>
      )}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 40 }}>
        {[['Secure checkout', 'Stripe payments. GST receipts included.'], ['Full resolution', 'Watermark-free originals after purchase.'], ['Takedown respected', 'Opt-out and 48-hour removal requests honoured.']].map(([t, d]) => (
          <div key={t} className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 700 }}>{t}</div>
            <div className="caption" style={{ marginTop: 4 }}>{d}</div>
          </div>
        ))}
      </section>

      <section className="card" style={{ padding: 28, display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h3 className="card-title">Are you a photographer?</h3>
          <p className="caption">Projects taken on a limited basis. Tell us about your project and we&apos;ll determine if it&apos;s a fit.</p>
        </div>
        <Link href="/sell" className="btn btn-primary btn-md">Sell your work</Link>
      </section>
    </>
  );
}
