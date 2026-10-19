'use client';

// Reel stage (P2B): plays the watermarked low-res teaser — the free preview,
// mirroring how photo detail shows the watermarked preview image. The full
// original is never embedded; owners get it via the download entitlement.
export default function ReelPlayer({ previewUrl, posterUrl, title }) {
  if (!previewUrl) {
    return (
      <div className="flex flex-col items-center gap-2 bg-black py-16 text-center">
        <span className="text-4xl" aria-hidden="true">🎬</span>
        <p className="text-[12.5px] text-muted">Teaser still rendering — check back shortly.</p>
      </div>
    );
  }
  return (
    <div className="bg-black">
      <video
        controls playsInline preload="metadata"
        poster={posterUrl || undefined}
        src={previewUrl}
        className="mx-auto max-h-[72vh] w-full"
        aria-label={title || 'Reel teaser'}>
        Sorry, your browser can&apos;t play this video.
      </video>
      <p className="px-5 py-2.5 text-[11px] text-faint">
        Watermarked teaser — full file unlocks after purchase.
      </p>
    </div>
  );
}
