'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SiteFooter, SiteHeader } from '../../../../components/figma';
import { API } from '../../../../lib/api';
import { merchPositions, merchProduct } from '../../../../lib/merch.mjs';
import { ORDER_STEPS, orderStatusLabel, orderStepIndex } from '../../../../lib/merch-order-status.mjs';
import { useDocumentTitle } from '../../../../lib/use-document-title';
import s from '../orders.module.css';

const nzd = (c) => `NZ$${(Number(c || 0) / 100).toFixed(2)}`;
const logoName = (v) => (String(v).startsWith('club:') ? 'Club logo' : String(v).startsWith('mlogo:') ? 'Your logo' : 'Sponsor logo');

// One merch order, opened from the emailed link (?t=token) or by a
// logged-in owner. Read only: proof approval and payment come later.
export default function MerchOrderPage() {
  const ref = String(useParams()?.ref || '').toUpperCase();
  useDocumentTitle(`Order ${ref}`);
  const [state, setState] = useState({ loading: true, order: null });
  useEffect(() => {
    let live = true;
    const t = new URLSearchParams(window.location.search).get('t') || '';
    fetch(`${API}/api/merch/orders/${encodeURIComponent(ref)}${t ? `?t=${encodeURIComponent(t)}` : ''}`, { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live) setState({ loading: false, order: j?.data || null }); })
      .catch(() => { if (live) setState({ loading: false, order: null }); });
    return () => { live = false; };
  }, [ref]);

  const o = state.order;
  const product = o ? merchProduct(o.productId) : null;
  const step = o ? orderStepIndex(o.status) : -1;
  const q = o?.quote || {};
  return (
    <div className="gallery-page">
      <SiteHeader />
      <main>
        <section className={`events-section gallery-browser section-gutter ${s.page}`} data-page-top>
          <p className={s.eyebrow}><Link href="/merch/orders">← My merch orders</Link></p>
          <h1 className={s.title}>Order {ref}</h1>
          {state.loading && <p className={s.muted}>Loading order…</p>}
          {!state.loading && !o && (
            <p className={s.muted}>We could not find this order. Open it from the link in your confirmation email, or log in with the account you ordered with.</p>
          )}
          {o && (
            <div className={s.layout}>
              <div className={s.card}>
                <p className={s.status}>{orderStatusLabel(o.status)}</p>
                {step >= 0 && (
                  <ol className={s.steps} aria-label="Order progress">
                    {ORDER_STEPS.map((st, i) => (
                      <li key={st.id} data-state={i < step ? 'done' : i === step ? 'now' : 'todo'} aria-current={i === step ? 'step' : undefined}>{st.label}</li>
                    ))}
                  </ol>
                )}
                <dl className={s.facts}>
                  <div><dt>Product</dt><dd>{product?.label || o.productId}</dd></div>
                  <div><dt>Sizes</dt><dd>{o.lines.map((l) => `${l.size} × ${l.qty}`).join(', ')}</dd></div>
                  {merchPositions(o.productId).filter((p) => o.design?.slots?.[p.id]).map((p) => (
                    <div key={p.id}><dt>{p.label}</dt><dd>{logoName(o.design.slots[p.id])}</dd></div>
                  ))}
                  <div><dt>Delivery</dt><dd>{o.delivery === 'pickup' ? `Club pickup${o.contact.club ? `, ${o.contact.club}` : ''}` : [o.address?.line1, o.address?.line2, o.address?.city, o.address?.postcode].filter(Boolean).join(', ')}</dd></div>
                  {o.notes && <div><dt>Notes</dt><dd>{o.notes}</dd></div>}
                  <div><dt>Placed</dt><dd>{new Date(o.createdAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}</dd></div>
                </dl>
              </div>
              <div className={s.card}>
                <h2 className={s.h2}>Quote</h2>
                <div className={s.row}><span>{q.units} items</span><span>{nzd((q.goodsCents || 0) + (q.discountCents || 0))}</span></div>
                {q.discountCents > 0 && <div className={s.row}><span>Sponsor discount</span><span className={s.gold}>−{nzd(q.discountCents)}</span></div>}
                <div className={s.row}><span>{o.delivery === 'pickup' ? 'Club pickup' : 'Courier'}</span><span>{q.shippingCents ? nzd(q.shippingCents) : 'Free'}</span></div>
                <div className={`${s.row} ${s.total}`}><span>Total</span><span>{nzd(o.totalCents)}</span></div>
                <p className={s.muted}>Includes {nzd(q.gstCents)} GST. Nothing is charged until you approve the artwork proof.</p>
              </div>
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
