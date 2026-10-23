/** @type {import('next').NextConfig} */
const API_URL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

module.exports = {
  async rewrites() {
    // Same-origin API proxy (same pattern as EQIndex web): browser calls
    // /api/* first-party, server forwards to Cloud Run. Session cookies stay
    // first-party, so login + checkout work on the Boss Media domain.
    return [{ source: '/api/:path*', destination: `${API_URL}/:path*` }];
  },
  images: { unoptimized: true },
  // Dev-only: no persistent webpack cache. The shared .next cache folder
  // kept getting poisoned when switching between `next start` and
  // `next dev` (stale chunks -> `__webpack_modules__ is not a function`
  // and 500s on CSS). Production builds are unaffected.
  webpack(config, { dev }) {
    if (dev) config.cache = false;
    return config;
  },
};
