import { SITE_URL, getJSON } from '../lib/api';

export const revalidate = 3600;

// Public crawl surface: static pages + every gallery event + every photo.
// Fail-open: a down API at build time yields the static routes, never a
// broken sitemap.
export default async function sitemap() {
  const base = SITE_URL;
  const staticRoutes = [
    '', '/events', '/photos', '/reels', '/pre-book', '/sell',
    '/about', '/licensing', '/pricing', '/faq', '/contact',
  ].map((p) => ({ url: `${base}${p || '/'}`, lastModified: new Date() }));

  let events = [];
  let photos = [];
  try {
    [{ data: events = [] } = {}, { data: photos = [] } = {}] = await Promise.all([
      getJSON('/events?limit=200&include_empty=1').catch(() => ({})),
      getJSON('/photos?limit=200').catch(() => ({})),
    ]);
  } catch { /* static routes only */ }

  const eventUrls = (events || [])
    .filter((e) => e.slug || e.id)
    .map((e) => ({ url: `${base}/events/${e.slug || e.id}`, lastModified: new Date() }));
  const photoUrls = (photos || [])
    .filter((m) => m.id)
    .map((m) => ({ url: `${base}/p/${m.id}`, lastModified: new Date() }));
  return [...staticRoutes, ...eventUrls, ...photoUrls];
}
