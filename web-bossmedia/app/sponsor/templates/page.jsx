'use client';
import Link from 'next/link';
import SponsorPhoto, { TEMPLATE_VARIANTS } from '../../../components/SponsorTemplates';
import { SiteFooter, SiteHeader } from '../../../components/figma';
import { useDocumentTitle } from '../../../lib/use-document-title';

// Galeri semua template overlay sponsor — persis board referensi.
// Tiap kartu = <SponsorPhoto> yang bisa dicopy ke gallery/checkout.
// Kartu galeri seragam 16/10 agar grid rapi; overlay menyesuaikan sendiri.
// Rasio asli tiap varian disebut di deskripsinya.
const DEMO = {
  event: 'AUCKLAND SHOW JUMPING CHAMPIONSHIP',
  className: 'Open Pony 1.20 m · Special 2 Phase',
  result: 'WINNER', subject: 'Lottie Bull & TCG Centadel',
};

export default function SponsorTemplatesPage() {
  useDocumentTitle('Sponsor templates');
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
              {TEMPLATE_VARIANTS.length} layout siap tempel — pilih yang pas dengan foto &amp; logo sponsor.
              <Link href="/sponsor" className="text-link"> Sponsor dashboard →</Link>
            </p>
          </div>
          {['Sponsor', 'Winner'].map((g) => (
            <div key={g}>
              <h2>{g === 'Sponsor' ? 'Sponsor only' : 'Winner poster'}</h2>
              <div className="template-gallery">
                {TEMPLATE_VARIANTS.filter((v) => v.group === g).map((v) => (
                  <article key={v.id} className="template-card" aria-label={v.name}>
                    <SponsorPhoto
                      variant={v.id} ratio="16 / 10"
                      event={DEMO.event} className={DEMO.className}
                      result={DEMO.result} subject={DEMO.subject}
                      sponsors={[{}]}
                    />
                    <div><strong>{v.name}</strong><span>{v.desc}</span></div>
                  </article>
                ))}
              </div>
            </div>
          ))}
          <h2>Cara pakai</h2>
          <pre style={{ background: '#0e2233', color: '#f3ecd9', padding: 16, borderRadius: 8, overflowX: 'auto', fontSize: 12, lineHeight: 1.6 }}>{`import SponsorPhoto from '@/components/SponsorTemplates';

<SponsorPhoto
  photo={media.preview_url}   // url foto
  variant="banner-wave"       // 1 dari ${TEMPLATE_VARIANTS.length} id di atas
  ratio="16 / 9"              // "4 / 5" portrait · "1 / 1" square
  sponsors={[{ src: logoUrl, label: 'Mitavite' }]}
  event="AUCKLAND SHOW JUMPING CHAMPIONSHIP"
  className="Open Pony 1.20 m" result="WINNER"
  subject="Lottie Bull & TCG Centadel"
/>`}</pre>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
