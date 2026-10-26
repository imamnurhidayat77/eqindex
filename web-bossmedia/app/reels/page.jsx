import { getJSON } from '../../lib/api';
import ReelsClient from '../../components/ReelsClient';

export const revalidate = 60;

export default async function ReelsPage() {
  const [{ data: reels }, { data: events }] = await Promise.all([
    getJSON('/photos?kind=reel&limit=48').catch(() => ({ data: [] })),
    getJSON('/events?limit=200').catch(() => ({ data: [] })),
  ]);
  const slugById = {};
  for (const e of events || []) slugById[e.id] = e.slug || e.id;
  const items = (reels || []).map((r) => ({
    id: r.id,
    // Never show "Unknown rider" on a card — fall back to horse, then event.
    rider: r.rider || r.horse || r.other_people || r.event_name || 'Boss Media reel',
    horse: r.horse || '',
    event: r.event_name || '',
    eventSlug: r.event_id && slugById[r.event_id] ? slugById[r.event_id] : null,
    image: r.thumb_url || r.preview_url || null,
  }));
  const eventOptions = [...new Set(items.map((r) => r.event).filter(Boolean))].sort();
  return <ReelsClient items={items} eventOptions={eventOptions} />;
}
