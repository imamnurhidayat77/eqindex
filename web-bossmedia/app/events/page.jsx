import Link from 'next/link';
import { getJSON } from '../../lib/api';

export const revalidate = 60;

export default async function EventsPage() {
  const { data } = await getJSON('/events?limit=60').catch(() => ({ data: [] }));
  const rows = data || [];
  return (
    <>
      <h1 className="page-title">Events</h1>
      <p className="caption" style={{ margin: '6px 0 18px' }}>Every covered show — pick one to browse its photos and reels.</p>
      {!rows.length ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <h3 className="card-title">No events yet</h3>
          <p className="caption">Galleries appear here as soon as coverage is published.</p>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {rows.map((e) => (
            <Link key={e.id} href={`/photos?event=${e.id}`} className="card" style={{ padding: 18, textDecoration: 'none' }}>
              <div className="caption num">{(e.date_start || '').slice(0, 10) || ''}</div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 22, margin: '6px 0' }}>{e.name}</div>
              <div className="caption">{[e.venue, e.region].filter(Boolean).join(' · ') || ''}</div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
