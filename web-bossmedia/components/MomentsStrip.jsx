'use client';
// "Moments from the crowd" — community photos for one event. Vanishes entirely
// when empty (same pattern as PhotoStrip): moments never beg for attention.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API } from '../lib/api';
import SmartImage from './SmartImage';
import { Icon } from './figma';

export default function MomentsStrip({ eventId }) {
  const [moments, setMoments] = useState(null);

  useEffect(() => {
    if (!eventId) return;
    fetch(`${API}/api/moments?event_id=${eventId}&limit=8`)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((j) => setMoments(Array.isArray(j?.data) ? j.data : []));
  }, [eventId]);

  if (!moments?.length) return null;
  return (
    <section className="event-media-section section-gutter" aria-label="Moments from the crowd">
      <div className="event-media-header">
        <div>
          <p className="eyebrow">Community</p>
          <h2>Moments from the crowd.</h2>
        </div>
        <p>Shared by spectators — free to view, never for sale. <Link href={`/moments?event_id=${eventId}`} className="text-link">View all →</Link></p>
      </div>
      <div className="event-media-grid">
        {moments.map((m) => (
          <Link className="event-media-card photo" key={m.id} href={`/moments/${m.id}`}
            aria-label={`${[m.horse, m.rider].filter(Boolean).join(' and ') || 'Community moment'}`}>
            {m.thumb_url || m.preview_url
              ? <SmartImage src={m.thumb_url || m.preview_url} alt={[m.horse, m.rider].filter(Boolean).join(' and ') || 'Community moment photo'} width={800} height={600} sizes="(max-width: 768px) 100vw, 25vw" />
              : <span className="cover-fallback">{m.kind === 'reel' ? 'Rendering…' : 'No preview'}</span>}
            {m.kind === 'reel' && <span className="media-kind">▶</span>}
            <span className="media-card-footer">
              <small title={m.event_name || ''}>{[m.horse, m.rider].filter(Boolean).join(' × ') || 'Untagged moment'}</small>
              <span className="media-card-title">
                <strong>Shared by a spectator</strong>
                <Icon name="arrow" size={15} />
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
