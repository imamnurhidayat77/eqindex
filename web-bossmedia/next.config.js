/** @type {import('next').NextConfig} */
const API_URL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

module.exports = {
  // The project root AGENTS.md governs agents; keep `next dev` from writing
  // its own copy into this folder.
  agentRules: false,
  async rewrites() {
    // Same-origin API proxy (same pattern as EQIndex web): browser calls
    // /api/* first-party, server forwards to Cloud Run. Session cookies stay
    // first-party, so login + checkout work on the Boss Media domain.
    return [{ source: '/api/:path*', destination: `${API_URL}/:path*` }];
  },
  images: {
    // Optimizer AKTIF: semua <img> mentah sudah lewat SmartImage
    // (components/SmartImage.jsx). Remote dixinkan via pola global
    // karena cover berasal dari backend/thumb CDN + Unsplash.
    unoptimized: false,
    remotePatterns: [
      { protocol: 'https', hostname: '**', pathname: '**' },
      { protocol: 'http', hostname: '**', pathname: '**' },
    ],
  },
  // Prod-only hardening headers. CSP stays OFF in dev (Next HMR needs
  // unsafe-eval) and HSTS stays off localhost.
  async headers() {
    if (process.env.NODE_ENV !== 'production') return [];
    const csp = [
      "default-src 'self'",
      // 'wasm-unsafe-eval' lets the 3D preview decode meshopt-compressed
      // .glb files (horse gear) with WebAssembly. It allows compiling wasm
      // only, not JavaScript eval. Without it those models fail in prod.
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      // blob: is required by the 3D merch preview: GLTFLoader unpacks the
      // textures embedded in every .glb into blob: URLs and fetches them,
      // and buyer-uploaded club logos are local blob: URLs. Without it the
      // production build renders every model untextured and club uploads
      // fail to load (dev has no CSP, so it only shows in prod).
      "img-src 'self' data: https: blob:",
      "media-src 'self' https: blob:",
      // https: extra allows the browser's direct-to-R2 video PUTs (venue-QR
      // and studio reel flows both use presigned URLs, never the API proxy).
      "connect-src 'self' https: blob:",
      // Merch PDF proofs open inline: same-origin from the API proxy, and
      // blob: for the admin's preview before sending.
      "frame-src 'self' blob:",
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
    }, {
      // A merch proof (PDF) is shown inside its own order page, so only this
      // path may be framed, and only by this site. Later rules win.
      source: '/api/merch/orders/:ref/proofs/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
      ],
    }];
  },
};
