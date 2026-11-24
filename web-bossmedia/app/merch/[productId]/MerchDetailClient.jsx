'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { SiteFooter, SiteHeader } from '../../../components/figma';
import MerchClient, { useClubParam, withClub } from '../../../components/MerchClient';
import { merchProduct } from '../../../lib/merch.mjs';
import { useDocumentTitle } from '../../../lib/use-document-title';
import s from './page.module.css';

export default function MerchDetailClient() {
  const params = useParams();
  const product = merchProduct(String(params?.productId));
  const clubId = useClubParam();
  useDocumentTitle(product ? `Customise ${product.label}` : 'Product not found');
  return (
    <div className="gallery-page">
      <SiteHeader />
      <main>
        <section className={`events-section gallery-browser section-gutter ${s.page}`} data-page-top>
          <div className={s.hero}>
            <div>
              <p className={s.eyebrow}><Link href={withClub('/merch', clubId)}>← All merchandise</Link></p>
              <h1 className={s.title}>{product ? `Customise your ${product.label.toLowerCase()}.` : 'Product not found.'}</h1>
            </div>
            <p className={s.note}>
              {product ? product.blurb : 'This product does not exist.'}
            </p>
          </div>
          {product ? (
            <MerchClient key={product.id} productId={product.id} single />
          ) : (
            <p className="empty-note"><Link href="/merch" className="text-link">← Back to all merchandise</Link></p>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
