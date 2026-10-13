'use client';

// Display-only image: blocks casual right-click save and drag-to-desktop.
// Honest limitation: screenshots can't be prevented — real protection is
// the baked-in watermark + non-HD preview size, enforced server-side.
export default function ProtectedImage({ src, alt, className, ...rest }) {
  return (
    <img
      src={src}
      alt={alt || ''}
      draggable={false}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      className={`${className || ''} select-none`.trim()}
      {...rest}
    />
  );
}
