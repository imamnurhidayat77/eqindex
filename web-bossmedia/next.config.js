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
  // Prod-only hardening headers. CSP stays OFF in dev (Next HMR needs
  // unsafe-eval) and HSTS stays off localhost.
  async headers() {
    if (process.env.NODE_ENV !== 'production') return [];
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      'img-src \'self\' data: https:',
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join('; ');
    return [{
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: csp },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }];
  },
  // Dev-only: no persistent webpack cache. The shared .next cache folder
  // kept getting poisoned when switching between `next start` and
  // `next dev` (stale chunks -> `__webpack_modules__ is not a function`
  // and 500s on CSS). Production builds are unaffected.
  webpack(config, { dev }) {
    if (dev) config.cache = false;
    return config;
  },
};
