'use client';
import { useEffect, useState } from 'react';
import ProtectedImage from './ProtectedImage';

// Orientation-aware photo stage. Portrait shots get a height-capped frame,
// landscapes go full-bleed — both float over a blurred ambient backdrop of
// the same image (lightbox-style), so neither orientation letterboxes
// awkwardly. Click to expand into a fullscreen viewer.
export default function PhotoViewer({ src, alt, width, height }) {
  const [open, setOpen] = useState(false);
  const portrait = width && height ? Number(height) > Number(width) : false;

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open ]);

  if (!src) return <span className="text-4xl py-16">📷</span>;

  return (
    <>
      <div className="group/stage relative bg-black select-none">
        {/* ambient backdrop */}
        <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
          <img src={src} alt="" draggable={false}
            className="h-full w-full object-cover blur-2xl scale-110 opacity-40" />
          <div className="absolute inset-0 bg-black/45" />
        </div>
        <ProtectedImage src={src} alt={alt}
          loading="eager" fetchPriority="high"
          className={`relative mx-auto ${portrait ? 'max-h-[72vh] w-auto' : 'w-full h-auto'}`} />
        <button onClick={() => setOpen(true)} aria-label="View fullscreen"
          className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-[12px] font-bold text-white border border-white/15 cursor-pointer opacity-0 group-hover/stage:opacity-100 focus:opacity-100 hover:bg-black/90 hover:border-gold/60 hover:text-gold transition">
          <span aria-hidden="true">⛶</span> Fullscreen
        </button>
      </div>

      {open && (
        <div role="dialog" aria-modal="true" aria-label={alt || 'Photo fullscreen'}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
          onClick={() => setOpen(false)}>
          <div aria-hidden="true" className="absolute inset-0 overflow-hidden bg-black">
            <img src={src} alt="" draggable={false}
              className="h-full w-full object-cover blur-2xl scale-110 opacity-30" />
            <div className="absolute inset-0 bg-black/55" />
          </div>
          <ProtectedImage src={src} alt={alt}
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[88vh] max-w-[94vw] w-auto h-auto rounded-lg border border-white/10 shadow-2xl object-contain" />
          <button onClick={() => setOpen(false)} aria-label="Close fullscreen"
            className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white text-[18px] border border-white/15 cursor-pointer hover:border-gold/60 hover:text-gold transition">
            ✕
          </button>
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[11px] text-white/50 whitespace-nowrap">
            Watermarked preview · ESC to close
          </span>
        </div>
      )}
    </>
  );
}
