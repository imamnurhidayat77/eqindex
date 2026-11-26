'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { SiteFooter, SiteHeader } from '../../components/figma';
import SmartImage from '../../components/SmartImage';
import { nzd, useClubParam, withClub } from '../../components/MerchClient';
import { merchClub } from '../../lib/merch-config.mjs';
import { MERCH_CATEGORIES, merchCutoutSrc, merchPositions, merchProducts } from '../../lib/merch.mjs';
import { useDocumentTitle } from '../../lib/use-document-title';
import s from '../../components/MerchStorefront.module.css';

const SORTS = [
  { id: 'popular', label: 'Popular' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
  { id: 'name', label: 'Name' },
];

function sortProducts(list, sort) {
  const arr = [...list];
  if (sort === 'price-asc') arr.sort((a, b) => a.baseCents - b.baseCents);
  else if (sort === 'price-desc') arr.sort((a, b) => b.baseCents - a.baseCents);
  else if (sort === 'name') arr.sort((a, b) => a.label.localeCompare(b.label));
  // Popular: badged products first, catalogue order otherwise.
  else arr.sort((a, b) => Number(Boolean(b.badge)) - Number(Boolean(a.badge)));
  return arr;
}


export default function MerchPage() {
  useDocumentTitle('Merchandise');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('popular');
  // Club storefront link (?club=<id>): every product opens with the club logo.
  const clubId = useClubParam();
  const club = merchClub(clubId);

  const products = useMemo(() => {
    const all = merchProducts();
    const list = category === 'all' ? all : all.filter((p) => p.category === category);
    return sortProducts(list, sort);
  }, [category, sort]);

  return (
    <div className="gallery-page">
      <SiteHeader />
      <main className={s.store}>
        <section className={`events-section gallery-browser section-gutter ${s.page}`} data-page-top>
          {/* Compact hero so the products start above the fold. Price notes
              stay factual: no discount figure until sponsor deals are real. */}
          <header className={s.hero}>
            <p className={s.eyebrow}>{club ? `${club.name} store${club.placeholder ? ' · placeholder' : ''}` : 'Boss Media merch'}</p>
            <h1>Club gear with <em>your logos</em></h1>
            <p className={s.sub}>
              {club
                ? 'Every item already carries your club logo. Add sponsor logos to the free spots.'
                : 'Pick an item, place your club and sponsor logos in 3D, and see the price as you go.'}
            </p>
          </header>

          <div className={s.toolbar}>
            <div className={s.pills} role="group" aria-label="Filter by category">
              {MERCH_CATEGORIES.map((c) => (
                <button key={c.id} type="button" className={s.pill}
                  aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>
                  {c.label}
                </button>
              ))}
            </div>
            <label className={s.sortWrap}>
              <span className={s.count} aria-live="polite">{products.length} product{products.length === 1 ? '' : 's'}</span>
              <span>Sort</span>
              <select className={s.sort} value={sort} onChange={(e) => setSort(e.target.value)}>
                {SORTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
          </div>

          <ul className={s.grid} aria-label="Merchandise">
            {products.map((p) => {
              const slots = merchPositions(p.id).length;
              return (
                <li key={p.id}>
                  <Link href={withClub(`/merch/${p.id}`, clubId)} className={s.card}
                    aria-label={`${p.label}, from ${nzd(p.baseCents)}. Customise`}>
                    <span className={s.media}>
                      {p.badge && <span className={s.badge}>{p.badge}</span>}
                      <SmartImage src={merchCutoutSrc(p.id)} alt={p.label} width={800} height={800} unoptimized
                        className={s.img} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </span>
                    <span className={s.body}>
                      <strong className={s.name}>{p.label}</strong>
                      <span className={s.meta}>{slots} logo spots · {p.colors.length} colours</span>
                      <span className={s.price}>From {nzd(p.baseCents)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
