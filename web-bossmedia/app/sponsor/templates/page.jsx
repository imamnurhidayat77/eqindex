'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import SponsorPhoto, { TEMPLATE_VARIANTS, LEGACY_VARIANTS } from '../../../components/SponsorTemplates';
import { SiteFooter, SiteHeader } from '../../../components/figma';
import { useDocumentTitle } from '../../../lib/use-document-title';

// Template review board: every current template on a landscape AND a
// portrait photo, with live class / moment / sponsor-count controls.
// ?land=<url>&port=<url> swaps in real photos (any host next/image allows).
const EVENT = 'Auckland SJ & Waitemata SJ Spring Showjumping Festival';
const SAMPLE_LOGOS = [
  ['PAK’nSAVE', '#ffd200', '#111', 300, 90],
  ['VET', '#c0392b', '#fff', 120, 120],
  ['EQUINE CO', '#0e2233', '#fff', 320, 80],
  ['FEED', '#16a085', '#fff', 200, 120],
  ['SADDLERY', '#8e44ad', '#fff', 300, 100],
  ['H', '#d35400', '#fff', 120, 120],
  ['TRAILERS NZ', '#27ae60', '#fff', 340, 80],
  ['TACK', '#2980b9', '#fff', 220, 110],
].map(([label, bg, fg, w, h], i) => ({
  id: `sample-${i}`,
  label,
  src: `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="10" fill="${bg}"/>`
    + `<text x="${w / 2}" y="${h * 0.62}" font-family="Arial, sans-serif" font-weight="700" font-size="${h * 0.38}" text-anchor="middle" fill="${fg}">${label}</text></svg>`)}`,
}));
const SHAPES = [['Landscape', '3 / 2', 'land'], ['Portrait', '2 / 3', 'port']];

export default function SponsorTemplatesPage() {
  useDocumentTitle('Sponsor templates');
  const [count, setCount] = useState(1);
  const [cls, setCls] = useState('1.20m Grand Prix');
  const [moment, setMoment] = useState('Winner');
  const [theme, setTheme] = useState('light');
  const [photos, setPhotos] = useState({});
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setPhotos({ land: q.get('land') || '', port: q.get('port') || '' });
  }, []);
  const sponsors = SAMPLE_LOGOS.slice(0, count);
  const card = (v) => (
    // Not .template-card: its global `span` rule would override template text sizes.
    <article key={v.id} aria-label={v.name} style={{ border: '1px solid #3a3a3a', background: '#101010', padding: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 10, alignItems: 'start' }}>
        {SHAPES.map(([label, ratio, key]) => (
          <SponsorPhoto key={key} variant={v.id} ratio={ratio} photo={photos[key] || undefined}
            alt={`${v.name}, ${label}`} theme={theme} event={EVENT} className={cls} result={moment} sponsors={sponsors} />
        ))}
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 13 }}><strong>{v.name}</strong> <small style={{ color: '#888' }}>{v.desc}</small></p>
    </article>
  );
  return (
    <div className="gallery-page">
      <SiteHeader />
      <main>
        <section className="events-section gallery-browser section-gutter" data-page-top>
          <div className="gallery-browser-heading">
            <div>
              <p className="eyebrow">Sponsors · Templates</p>
              <h1>Photo templates.</h1>
            </div>
            <p className="empty-note">
              {TEMPLATE_VARIANTS.length} layouts in light and dark, each showing the event, the buyer&apos;s class and moment, and 1 to 8 sponsors.
              <Link href="/sponsor" className="text-link"> Sponsor dashboard →</Link>
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end', margin: '8px 0 16px' }}>
            <label style={{ display: 'grid', gap: 6, fontSize: 12 }}>Sponsors: {count}
              <input type="range" min={1} max={SAMPLE_LOGOS.length} value={count} onChange={(e) => setCount(Number(e.target.value))} />
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: 12 }}>Style
              <select value={theme} onChange={(e) => setTheme(e.target.value === 'dark' ? 'dark' : 'light')}>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: 12 }}>Class
              <input value={cls} onChange={(e) => setCls(e.target.value.slice(0, 100))} />
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: 12 }}>Moment
              <input value={moment} onChange={(e) => setMoment(e.target.value.slice(0, 40))} />
            </label>
          </div>
          <div className="template-gallery">{TEMPLATE_VARIANTS.map(card)}</div>
          <details style={{ marginTop: 24 }}>
            <summary style={{ cursor: 'pointer' }}>Retired templates ({LEGACY_VARIANTS.length}) · kept only for designs already bought</summary>
            <div className="template-gallery">{LEGACY_VARIANTS.map(card)}</div>
          </details>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
