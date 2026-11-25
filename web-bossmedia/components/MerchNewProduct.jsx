'use client';
// Studio > Admin > Merch catalog > Add a product. Two steps on one page:
// pick the built-in 3D model the product reuses, then name it (the link id
// follows the name until edited). Continue opens the full editor with the
// product prefilled from the model, hidden from the store until saved and
// switched on there.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SmartImage from './SmartImage';
import { studio } from '../lib/studio';
import { MERCH_PRODUCTS, isHorseProduct, merchCutoutSrc, newMerchProductDraft } from '../lib/merch.mjs';
import s from './MerchNewProduct.module.css';

const ID_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const slugify = (v) => String(v).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const nzd = (c) => `NZ$${(Number(c) / 100).toFixed(0)}`;

export default function MerchNewProduct() {
  const router = useRouter();
  const [taken, setTaken] = useState(null); // ids already in the catalog
  const [model, setModel] = useState(null);
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [idEdited, setIdEdited] = useState(false);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    studio.get('/api/merch/catalog').then((rows) => setTaken(new Set((rows || []).map((r) => r.id)))).catch(() => setTaken(new Set()));
  }, []);
  const cards = useMemo(() => MERCH_PRODUCTS.map((p) => {
    const draft = newMerchProductDraft('x-preview', p.id);
    return { ...p, spots: draft.slotList.length, horse: isHorseProduct(p.id) };
  }), []);

  const slug = idEdited ? id : slugify(name);
  const idError = !slug ? 'Give the product a name first.'
    : !ID_RE.test(slug) ? '2 to 40 lowercase letters, digits or dashes.'
      : taken?.has(slug) ? 'This link is already used by another product.' : '';
  const ready = Boolean(model) && name.trim().length >= 2 && !idError;
  const picked = cards.find((c) => c.id === model);

  function next(e) {
    e.preventDefault();
    setTried(true);
    if (!ready) return;
    const q = new URLSearchParams({ id: slug, model, name: name.trim() });
    router.push(`/studio/admin/merch/new?${q}`);
  }

  return (
    <form className={s.page} onSubmit={next} noValidate>
      <Link href="/studio/admin?section=catalog" className={s.back}>← Merch catalog</Link>
      <header className={s.head}>
        <h2 className={s.title}>Add a product</h2>
        <p className={s.sub}>A new product reuses one of the 3D models below. Its name, price, colours, sizes and logo spots are its own.</p>
      </header>

      <div className={s.layout}>
        <div className={s.steps}>
          <section className={s.step} aria-labelledby="step-model">
            <div className={s.stepHead}>
              <span className={s.stepNum} data-done={model ? 'true' : undefined}>{model ? '✓' : '1'}</span>
              <div>
                <h3 id="step-model" className={s.stepTitle}>Choose a 3D model</h3>
                <p className={s.stepSub}>The shape buyers rotate in the designer. A new shape (boots, bags) needs code first.</p>
              </div>
            </div>
            <div className={s.grid} role="radiogroup" aria-labelledby="step-model">
              {cards.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={model === c.id} className={s.card} onClick={() => setModel(c.id)}>
                  <span className={s.media}>
                    <SmartImage src={merchCutoutSrc(c.id)} alt={`${c.label} 3D model`} width={320} height={320} unoptimized
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  </span>
                  <span className={s.cardBody}>
                    <span className={s.cardName}>{c.label}</span>
                    <span className={s.cardMeta}>{c.horse ? 'Horse' : 'Rider'} · {c.spots} logo spots</span>
                  </span>
                  <span className={s.check} aria-hidden="true">✓</span>
                </button>
              ))}
            </div>
            {tried && !model && <p className={s.error} role="alert">Pick a 3D model.</p>}
          </section>

          <section className={s.step} aria-labelledby="step-name">
            <div className={s.stepHead}>
              <span className={s.stepNum} data-done={ready ? 'true' : undefined}>{ready ? '✓' : '2'}</span>
              <div>
                <h3 id="step-name" className={s.stepTitle}>Name it</h3>
                <p className={s.stepSub}>The link cannot change once the product exists.</p>
              </div>
            </div>
            <div className={s.fields}>
              <label className={s.field}>
                <span className={s.label}>Product name</span>
                <input value={name} maxLength={60} placeholder="e.g. Club hoodie" autoComplete="off"
                  aria-invalid={tried && name.trim().length < 2 ? 'true' : undefined}
                  onChange={(e) => setName(e.target.value)} />
                {tried && name.trim().length < 2 && <span className={s.error} role="alert">At least 2 characters.</span>}
              </label>
              <label className={s.field}>
                <span className={s.label}>Store link</span>
                <span className={s.urlField}>
                  <em aria-hidden="true">/merch/</em>
                  <input value={slug} maxLength={40} placeholder="club-hoodie" autoComplete="off" spellCheck={false}
                    aria-invalid={(tried || idEdited) && idError ? 'true' : undefined} aria-describedby="id-help"
                    onChange={(e) => { setIdEdited(true); setId(e.target.value.toLowerCase()); }} />
                </span>
                <span id="id-help" className={(tried || idEdited) && idError ? s.error : s.help}>
                  {(tried || idEdited) && idError ? idError : 'Filled from the name. Lowercase letters, digits and dashes.'}
                </span>
              </label>
            </div>
          </section>
        </div>

        <aside className={s.summary} aria-label="Summary">
          <div className={s.summaryMedia}>
            {picked
              ? <SmartImage src={merchCutoutSrc(picked.id)} alt={picked.label} width={480} height={480} unoptimized
                style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : <span className={s.placeholder}>Pick a model</span>}
          </div>
          <dl className={s.facts}>
            <div><dt>Name</dt><dd>{name.trim() || '—'}</dd></div>
            <div><dt>Link</dt><dd className={s.mono}>{slug ? `/merch/${slug}` : '—'}</dd></div>
            <div><dt>3D model</dt><dd>{picked?.label || '—'}</dd></div>
            <div><dt>Starts from</dt><dd>{picked ? `${nzd(picked.baseCents)} · ${picked.colors.length} colours · ${picked.spots} spots` : '—'}</dd></div>
            <div><dt>Status</dt><dd>Hidden until you switch it on</dd></div>
          </dl>
          <button type="submit" className={`st-btn ${s.submit}`} disabled={taken === null}>Continue to editor →</button>
          <p className={s.help}>Nothing is saved until you press Add product in the editor.</p>
        </aside>
      </div>
    </form>
  );
}
