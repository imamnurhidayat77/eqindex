// Same-origin logo bytes for the 3D preview (WebGL textures reject
// cross-origin images without CORS; the public file endpoint 303s to R2).
// Only serves what the backend serves: active logos of active sponsors.
// NOTE: lives outside /api/* on purpose — next.config rewrites proxy all
// of /api/* to the backend before app routes are matched, so a route
// under /api/* here would never be reached. Falls back to a neutral
// patch so a missing file can never crash the Canvas.
export async function GET(_req, props) {
  const params = await props.params;
  const id = String(params?.id || '');
  if (!/^[\w-]{1,80}$/.test(id)) {
    return Response.json({ error: 'logo not found' }, { status: 404 });
  }
  try {
    const base = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const upstream = await fetch(`${base}/api/sponsor-logos/${id}/file`, { redirect: 'follow' });
    if (upstream.ok) {
      const ct = upstream.headers.get('content-type') || 'image/png';
      if (ct.startsWith('image/')) {
        const buf = await upstream.arrayBuffer();
        if (buf.byteLength && buf.byteLength <= 3 * 1024 * 1024) {
          return new Response(buf, {
            headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=3600' },
          });
        }
      }
    }
  } catch { /* fall through to the patch below */ }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="256">` +
    `<rect width="512" height="256" fill="#f3ecd9"/>` +
    `<text x="256" y="128" font-family="Arial,sans-serif" font-size="44" font-weight="bold" text-anchor="middle" fill="#101010">SPONSOR</text>` +
    `<text x="256" y="172" font-family="Arial,sans-serif" font-size="24" text-anchor="middle" fill="#555555">logo pending</text></svg>`;
  return new Response(svg, {
    // Never cached: a brief API outage must not pin the placeholder in the
    // browser once the real logo is reachable again.
    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' },
  });
}
