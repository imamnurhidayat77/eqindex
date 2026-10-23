import Link from 'next/link';
import { SiteFooter, SiteHeader } from '../components/figma';

export default function NotFound() {
  return (
    <div className="gallery-page">
      <SiteHeader />
      <main className="prose-page section-gutter">
        <p className="eyebrow" style={{ color: '#666' }}>404</p>
        <h1>Looks like this one refused the jump.</h1>
        <p className="intro">That page isn&apos;t in the arena. Let&apos;s get you back on course.</p>
        <p><Link href="/" className="btn-ghost">Back to the gallery →</Link></p>
      </main>
      <SiteFooter />
    </div>
  );
}
