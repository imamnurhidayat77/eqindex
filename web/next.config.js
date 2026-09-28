/** @type {import('next').NextConfig} */
const API_URL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

module.exports = {
  async rewrites() {
    return [
      // Same-origin API proxy: browser calls /api/* (first-party cookies,
      // immune to third-party cookie blocking), server forwards to Cloud Run.
      { source: '/api/:path*', destination: `${API_URL}/:path*` },
    ];
  },
};
