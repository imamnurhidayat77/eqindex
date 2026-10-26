import { SITE_URL } from '../lib/api';

export default function robots() {
  const base = SITE_URL;
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Private + thin pages: account, checkout, consoles, receipts.
        disallow: ['/cart', '/login', '/register', '/forgot', '/reset', '/studio', '/organizer', '/media', '/favourites', '/photos/success', '/api/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
