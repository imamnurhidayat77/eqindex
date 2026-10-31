import Image from 'next/image';

// Satu pintu untuk gambar: next/image untuk URL remote/lokal,
// <img> mentah hanya untuk blob:/data: (object URL pratinjau lokal
// tidak bisa lewat optimizer Next).
// - fill: parent wajib position:relative + ukuran pasti
//   (hero, event-image, reel-card, login-visual, story, my-image, tagthumb)
// - width/height: flow statis / grid-item / flex-item
//   (cart, modal, media-card, lightbox, purchase-preview)
const LOCAL_SRC = /^(blob:|data:)/;

export default function SmartImage({
  src,
  alt = '',
  fill = false,
  width,
  height,
  sizes,
  priority = false,
  fetchPriority,
  className,
  style,
  ...rest
}) {
  if (!src || LOCAL_SRC.test(src)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} loading={priority ? 'eager' : 'lazy'} className={className} style={style} {...rest} />;
  }
  if (fill) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes || '100vw'}
        priority={priority}
        fetchPriority={fetchPriority}
        className={className}
        style={style}
        {...rest}
      />
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={width || 800}
      height={height || 600}
      sizes={sizes}
      priority={priority}
      fetchPriority={fetchPriority}
      className={className}
      style={style}
      {...rest}
    />
  );
}
