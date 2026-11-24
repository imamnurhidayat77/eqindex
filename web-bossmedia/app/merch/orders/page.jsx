'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SiteFooter, SiteHeader } from '../../../components/figma';
import { ORDERS_KEY } from '../../../components/MerchOrderForm';
import { API } from '../../../lib/api';
import { merchProduct } from '../../../lib/merch.mjs';
import { orderStatusLabel } from '../../../lib/merch-order-status.mjs';
import { useDocumentTitle } from '../../../lib/use-document-title';
import s from './orders.module.css';

const nzd = (c) => `NZ$${(Number(c || 0) / 100).toFixed(2)}`;

// Merch orders from the account (logged in) plus order links this
// browser kept for guest orders. Guest rows are fetched with their token.
export default function MyMerchOrdersPage() {
  useDocumentTitle('My merch orders');
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let live = true;
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]').filter((o) => o?.ref && o?.token).slice(0, 20); } catch { /* ignore */ }
    const mine = fetch(`${API}/api/my/merch-orders`, { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null)).then((j) => j?.data || []).catch(() => []);
    const guest = Promise.all(saved.map((o) => fetch(`${API}/api/merch/orders/${encodeURIComponent(o.ref)}?t=${encodeURIComponent(o.token)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j?.data ? {
        ref: j.data.ref, status: j.data.status, product_id: j.data.productId, total_cents: j.data.totalCents,
        created_at: j.data.createdAt, units: j.data.lines.reduce((n, l) => n + l.qty, 0), token: o.token,
      } : null))
      .catch(() => null)));
    Promise.all([mine, guest]).then(([a, b]) => {
      if (!live) return;
      const byRef = new Map();
      for (const r of [...b.filter(Boolean), ...a]) byRef.set(r.ref, { ...byRef.get(r.ref), ...r });
      setRows([...byRef.values()].sort((x, y) => new Date(y.created_at) - new Date(x.created_at)));
    });
    return () => { live = false; };
  }, []);

  return (
    <div className="gallery-page">
      <SiteHeader />
      <main>
        <section className={`events-section gallery-browser section-gutter ${s.page}`} data-page-top>
          <p className={s.eyebrow}><Link href="/merch">← All merchandise</Link></p>
          <h1 className={s.title}>My merch orders</h1>
          {!rows && <p className={s.muted}>Loading orders…</p>}
          {rows && !rows.length && (
            <p className={s.muted}>No orders yet. Orders placed while logged in, or from this browser, show up here. <Link href="/merch" className={s.link}>Design your merch →</Link></p>
          )}
          {rows?.length > 0 && (
            <ul className={s.list}>
              {rows.map((r) => (
                <li key={r.ref}>
                  <Link className={s.item} href={`/merch/orders/${r.ref}${r.token ? `?t=${encodeURIComponent(r.token)}` : ''}`}>
                    <span><strong>{r.ref}</strong><small>{merchProduct(r.product_id)?.label || r.product_id} · {r.units} items</small></span>
                    <span className={s.itemStatus}>{orderStatusLabel(r.status)}</span>
                    <span className={s.itemTotal}>{nzd(r.total_cents)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
