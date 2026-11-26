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
        ref: j.data.ref, status: j.data.status, delivery: j.data.delivery, product_id: j.data.productId, total_cents: j.data.totalCents,
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
                    <span className={s.itemStatus}>{orderStatusLabel(r.status, r.delivery)}</span>
                    <span className={s.itemTotal}>{nzd(r.total_cents)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <ResendLinks />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

// Lost link (other browser, deleted email): we email the links to every
// recent order on that address. The answer never says whether it has any.
function ResendLinks() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ busy: false, sent: false, error: '' });
  async function send(e) {
    e.preventDefault();
    if (state.busy) return;
    setState({ busy: true, sent: false, error: '' });
    try {
      const r = await fetch(`${API}/api/merch/orders/resend-links`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not send right now, try again later.');
      setState({ busy: false, sent: true, error: '' });
    } catch (err) {
      setState({ busy: false, sent: false, error: err.message });
    }
  }
  return (
    <form className={`${s.card} ${s.resend}`} onSubmit={send} noValidate>
      <h2 className={s.h2}>Can't find an order?</h2>
      <p className={s.muted}>Enter the email you ordered with and we will send you the links to your orders.</p>
      {state.sent ? (
        <p className={s.ok} role="status">If there are orders on {email.trim()}, the links are on their way. Check your inbox and spam folder.</p>
      ) : (
        <div className={s.resendRow}>
          <label className={s.field}>
            <span className={s.srOnly}>Email</span>
            <input type="email" inputMode="email" autoComplete="email" required maxLength={254} value={email}
              placeholder="you@example.com" onChange={(e) => setEmail(e.target.value)} aria-invalid={state.error ? 'true' : undefined} />
          </label>
          <button type="submit" className={s.primary} disabled={state.busy || !email.trim()}>{state.busy ? 'Sending…' : 'Email my order links'}</button>
        </div>
      )}
      {state.error && <p className={s.err} role="alert">{state.error}</p>}
    </form>
  );
}
