import Link from 'next/link';
import { getJSON } from '../../lib/api';
import ReelOrderForm from '../../components/ReelOrderForm';

export const revalidate = 60;

export default async function ReelsPage({ searchParams }) {
  const sp = searchParams || {};
  const [events, showcase] = await Promise.all([
    getJSON('/events?limit=30').catch(() => ({ data: [] })),
    getJSON('/photos?kind=reel&limit=8').catch(() => ({ data: [] })),
  ]);
  return (
    <>
      <h1 className="page-title">Order a video reel</h1>
      <p className="caption" style={{ margin: '6px 0 18px' }}>Custom reels filmed and edited for you — pay up front, we produce after.</p>

      <form method="get" action="/reels" className="field" style={{ maxWidth: 520 }}>
        <label htmlFor="reel-event">Event</label>
        <select id="reel-event" name="event" defaultValue={sp.event || ''}>
          <option value="">All events (global prices)</option>
          {(events.data || []).map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <div style={{ marginTop: 8 }}>
          <button type="submit" className="btn btn-secondary btn-sm">Show products</button>
        </div>
      </form>

      <ReelOrderForm eventId={sp.event || null}
        eventName={(events.data || []).find((e) => e.id === sp.event)?.name} />

      {!!(showcase.data || []).length && (
        <section style={{ marginTop: 36 }}>
          <h2 className="section-title">Fresh from the ring</h2>
          <p className="caption" style={{ margin: '4px 0 14px' }}>Recent teasers riders allowed us to share.</p>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {showcase.data.map((r) => (
              <Link key={r.id} href={`/p/${r.id}`} className="card">
                {r.thumb_url || r.preview_url
                  ? <img src={r.thumb_url || r.preview_url} alt="" loading="lazy" />
                  : <div style={{ aspectRatio: '4/3', display: 'grid', placeItems: 'center', background: '#eceae4' }}>▶</div>}
                <div className="cap">
                  <b>{[r.horse, r.rider].filter(Boolean).join(' × ') || r.event_name || ''}</b>
                  <span>{r.event_name || ''}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
      <p style={{ marginTop: 24 }}>
        <Link href="/media" style={{ color: '#1F3D2E', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>My reels →</Link>
      </p>
    </>
  );
}
