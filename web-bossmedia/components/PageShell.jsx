import { SiteFooter, SiteHeader } from './figma';

// Dark Figma shell for utility/library pages (photos, favourites, media,
// sell, takedown, legal). Title block mirrors the gallery headings.
export default function PageShell({ eyebrow, title, intro, children, wide = false }) {
  return (
    <div className="gallery-page">
      <SiteHeader />
      <main className="prose-page section-gutter">
        <p className="eyebrow" style={{ color: '#666' }}>{eyebrow}</p>
        <h1>{title}</h1>
        {intro && <p className="intro">{intro}</p>}
        <div className="body" style={wide ? { maxWidth: 'none' } : undefined}>{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
