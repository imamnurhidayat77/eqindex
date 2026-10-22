import Link from 'next/link';
import { getJSON } from '../lib/api';
import NotifyForm from '../components/NotifyForm';
import MomentSearch from '../components/MomentSearch';
import FavButton from '../components/FavButton';

export const revalidate = 60;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtMonthYear = (ds) => {
  const d = new Date(ds);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

export default async function Home() {
  const [{ data: photos }, { data: events }] = await Promise.all([
    getJSON('/photos?limit=48').catch(() => ({ data: [] })),
    getJSON('/events?limit=12').catch(() => ({ data: [] })),
  ]);
  const rows = photos || [];
  const hero = rows[0];
  // Latest 4 events with real cover photos; upcoming ones (future start)
  // get a notify action instead of a gallery link.
  const now = Date.now();
  const evCards = [];
  for (const e of (events || []).slice(0, 4)) {
    let cover = null;
    try {
      const r = await getJSON(`/photos?event_id=${e.id}&limit=1`).catch(() => ({ data: [] }));
      cover = (r.data || [])[0] || null;
    } catch { /* cover optional */ }
    const upcoming = e.date_start && new Date(e.date_start).getTime() > now;
    evCards.push({ e, cover, upcoming });
  }
  const quickTabs = (events || []).slice(0, 3);

  return (
    <>
      {/* HERO — dark, full-bleed latest photo, serif headline, archive search */}
      <section aria-label="Featured event" style={{ background: '#101010', borderRadius: 16, overflow: 'hidden', marginBottom: 40 }}>
        <div style={{ position: 'relative', minHeight: 460, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          {hero && (hero.preview_url || hero.thumb_url) && (
            <img src={hero.preview_url || hero.thumb_url} alt="" fetchPriority="high"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55 }} />
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.45), rgba(0,0,0,.25) 45%, rgba(0,0,0,.6))' }} /* taste-skill-ignore: neutral scrim under hero text on photo (explicitly allowed exception) */ />
          <div style={{ position: 'relative', padding: '72px 24px', maxWidth: 860 }}>
            <span className="badge" style={{ background: 'rgba(255,255,255,.14)', color: '#fff', border: '1px solid rgba(255,255,255,.35)' }}>
              Official circuit proofs &amp; media
            </span>
            <h1 className="display hero-h1" data-probe="h1test" style={{ color: '#fff', fontSize: 'clamp(44px, 7vw, 88px)', margin: '18px 0 12px' }}>
              Every stride, <em style={{ fontStyle: 'italic' }}>captured.</em>
            </h1>
            <p className="hero-sub" style={{ color: '#D8D5CC', fontSize: 18, margin: '0 auto', maxWidth: 560 }}>
              High-speed digital proofing and authentic 4K motion coverage from New Zealand&apos;s premier showjumping arenas.
            </p>
            <div className="search-pill" style={{ marginTop: 24, background: '#fff', borderRadius: 999, padding: 6, display: 'flex', gap: 8, maxWidth: 640, marginLeft: 'auto', marginRight: 'auto' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <MomentSearch hero />
              </div>
              <Link href="/photos" className="btn btn-primary btn-md" style={{ textDecoration: 'none', borderRadius: 999, whiteSpace: 'nowrap' }}>
                Search archive
              </Link>
            </div>
            {!!quickTabs.length && (
              <div className="quick-tabs" style={{ marginTop: 14, fontSize: 13, color: '#B9B9B4' }}>
                <span style={{ marginRight: 10 }}>Quick tabs:</span>
                {quickTabs.map((e) => (
                  <Link key={e.id} href={`/photos?event=${e.id}`} style={{ color: '#fff', marginRight: 14 }}>
                    {e.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* LATEST EVENTS — real covers, real status */}
      <section aria-label="Latest events" style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 className="section-title">Latest Events</h2>
          <Link href="/events" style={{ color: '#1F3D2E', fontWeight: 700, fontSize: 13, letterSpacing: 1, textDecoration: 'none' }}>
            View all events →
          </Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
          {evCards.map(({ e, cover, upcoming }) => (
            <div key={e.id} className="card">
              <div style={{ position: 'relative' }}>
                {cover && (cover.thumb_url || cover.preview_url) ? (
                  <img src={cover.thumb_url || cover.preview_url} alt="" loading="lazy"
                    style={{ width: '100%', aspectRatio: '16/10', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ aspectRatio: '16/10', background: '#eceae4' }} />
                )}
                <span className="badge" style={{
                  position: 'absolute', top: 10, left: 10,
                  background: upcoming ? '#1C1C1A' : '#2E7D4F',
                }}>
                  {upcoming ? `Upcoming · ${fmtMonthYear(e.date_start)}` : 'Published'}
                </span>
              </div>
              <div style={{ padding: 14 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{e.name}</div>
                <div className="caption" style={{ marginTop: 2 }}>
                  {[e.venue, fmtMonthYear(e.date_start || e.date_end)].filter(Boolean).join(' · ')}
                </div>
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {upcoming ? (
                    <Link href="/#notify" style={{ color: '#1F3D2E', fontWeight: 800, fontSize: 13, letterSpacing: 1, textDecoration: 'none' }}>
                      Notify me
                    </Link>
                  ) : (
                    <Link href={`/photos?event=${e.id}`} style={{ color: '#1F3D2E', fontWeight: 800, fontSize: 13, letterSpacing: 1, textDecoration: 'none' }}>
                      View gallery
                    </Link>
                  )}
                  <span aria-hidden="true" style={{ color: '#1F3D2E', fontWeight: 800 }}>→</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        {!evCards.length && <p className="caption">New event galleries land here after each show weekend.</p>}
      </section>

      {/* REELS BAND — dark, feature cards + pre-order */}
      <section aria-label="Custom reels" style={{ background: '#1F3D2E', color: '#fff', borderRadius: 16, padding: '36px 32px', margin: '40px 0' }}>
        <div className="caption" style={{ color: '#9DB8A6', letterSpacing: 2, fontWeight: 700 }}>Event reels &amp; video</div>
        <h2 className="section-title" style={{ color: '#fff', margin: '8px 0' }}>Order a Custom Reel</h2>
        <p style={{ color: '#D8D5CC', fontSize: 15, maxWidth: 520, margin: '0 0 20px' }}>
          Pre-order dedicated video coverage of your competition round. Cleanly edited and formatted
          for Instagram Reels, TikTok, or your personal archive.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            ['Complete Round Footage', 'Full jumping round captured ringside in crisp 4K from optimal vantage points.'],
            ['9:16 Vertical Format', 'Dynamic vertical cut with subtle pacing and colour grade, ready to share immediately on social media.'],
            ['Rider & Horse Details', 'Subtle intro graphic featuring rider name, horse name, event and class information.'],
            ['Direct Digital Download', 'Delivered directly to your email or Boss Media account within 24–48 hours of the class.'],
          ].map(([t, d]) => (
            <div key={t} style={{ border: '1px solid rgba(255,255,255,.22)', borderRadius: 12, padding: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{t}</div>
              <div style={{ fontSize: 14, color: '#D8D5CC', marginTop: 6 }}>{d}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/reels" className="btn btn-md" style={{ textDecoration: 'none', background: '#fff', color: '#1F3D2E', fontWeight: 800, borderRadius: 8, padding: '12px 20px' }}>
            Pre-order reel →
          </Link>
          <span className="num" style={{ fontSize: 13, color: '#9DB8A6' }}>Bookings close 1 hour before scheduled class start.</span>
        </div>
      </section>

      {/* ROSTER + NOTIFY */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 8 }}>
        <div className="card" style={{ padding: 24 }}>
          <div className="caption" style={{ letterSpacing: 2, fontWeight: 700 }}>Collaboration</div>
          <h3 className="card-title" style={{ margin: '6px 0' }}>Join the Boss Media Roster</h3>
          <p className="caption" style={{ fontSize: 14 }}>We partner with dedicated equestrian photographers across both North and South Island competition fixtures. Submit your portfolio for consideration.</p>
          <p style={{ marginTop: 14 }}><Link href="/sell" className="btn btn-primary btn-sm" style={{ textDecoration: 'none', background: '#1C1C1A' }}>Submit portfolio</Link></p>
        </div>
        <div className="card" style={{ padding: 24 }} id="notify">
          <div className="caption" style={{ letterSpacing: 2, fontWeight: 700 }}>Alerts</div>
          <h3 className="card-title" style={{ margin: '6px 0' }}>Event Notifications</h3>
          <p className="caption" style={{ fontSize: 14 }}>Get one email the moment new fixture proofs and class photos publish. No spam, ever.</p>
          <NotifyForm />
        </div>
      </section>
    </>
  );
}
