import { getJSON } from '../lib/api';
import { galleryEvents } from '../lib/figma-data';
import HomeClient from '../components/HomeClient';

export const revalidate = 60;

export default async function Home() {
  const [items, { data: reelPhotos }] = await Promise.all([
    galleryEvents(),
    getJSON('/photos?kind=reel&limit=6').catch(() => ({ data: [] })),
  ]);
  // Same hero image as the Figma design.
  const heroImage = 'https://images.unsplash.com/photo-1594768816441-1dd241ffaa67?auto=format&fit=crop&w=2000&q=90';
  const reels = (reelPhotos || []).map((r) => ({
    id: r.id,
    // Never show "Unknown rider" on a card — fall back to horse, then event.
    rider: r.rider || r.horse || r.other_people || r.event_name || 'Boss Media reel',
    horse: r.horse || '',
    event: r.event_name || '',
    image: r.thumb_url || r.preview_url || null,
    video: r.preview_url || null,
    kind: r.kind,
  }));
  const regions = [...new Set(items.map((it) => it.region).filter(Boolean))].sort();
  const years = [...new Set(items.map((it) => it.year).filter((y) => y && y !== '—'))].sort().reverse();
  const tiers = [...new Set(items.map((it) => it.tier).filter(Boolean))].sort();

  return (
    <HomeClient
      items={items}
      heroImage={heroImage}
      reels={reels}
      regions={regions}
      years={years}
      tiers={tiers}
    />
  );
}
