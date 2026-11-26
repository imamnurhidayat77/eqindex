'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SiteFooter, SiteHeader } from '../../../components/figma';
import { ORDERS_KEY } from '../../../components/MerchOrderForm';
import { API } from '../../../lib/api';
import SmartImage from '../../../components/SmartImage';
import { merchColorName, merchCutoutSrc, merchProduct } from '../../../lib/merch.mjs';
import { ORDER_STEPS, orderStatusLabel, orderStepIndex } from '../../../lib/merch-order-status.mjs';
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
        ref: j.data.ref, status: j.data.status, delivery: j.data.delivery, product_id: j.data.productId, color: j.data.color, total_cents: j.data.totalCents,
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
          <div className={s.headRow}>
            <h1 className={s.title}>My merch orders</h1>
            {rows?.length > 0 && <span className={s.count}>{rows.length} order{rows.length === 1 ? '' : 's'}</span>}
          </div>
          <p className={s.sub}>Track your proof, payment and delivery. Open an order to see your design in 3D.</p>
          <div className={s.listGrid}>
            <div className={s.orders}>
              {!rows && <p className={s.muted}>Loading orders…</p>}
              {rows && !rows.length && (
                <div className={`${s.card} ${s.empty}`}>
                  <span className={s.emptyIcon} aria-hidden="true">◇</span>
                  <h2 className={s.h2}>No orders here yet</h2>
                  <p className={s.muted}>Orders placed while logged in, or from this browser, show up here. Ordered somewhere else? Use the form to get your links by email.</p>
                  <Link href="/merch" className={s.primaryLink}>Design your merch</Link>
                </div>
              )}
              {rows?.length > 0 && (
                <ul className={s.list}>
                  {rows.map((r) => <OrderRow key={r.ref} row={r} />)}
                </ul>
              )}
            </div>
            <aside className={s.helpCol}>
              <ResendLinks />
              <div className={`${s.card} ${s.helpCard}`}>
                <h2 className={s.h2}>How it works</h2>
                <ol className={s.howList}>
                  <li><strong>Artwork check.</strong> We check your logos and send a proof.</li>
                  <li><strong>Approve.</strong> You approve the proof or ask for changes.</li>
                  <li><strong>Pay.</strong> Nothing is charged before you approve.</li>
                  <li><strong>Made and sent.</strong> We produce it and courier it, or it waits at your club.</li>
                </ol>
              </div>
            </aside>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

// One order: product cutout, reference and status, a thin progress bar, total.
function OrderRow({ row: r }) {
  const product = merchProduct(r.product_id);
  const step = orderStepIndex(r.status);
  const tone = ['paid', 'in_production', 'shipped', 'delivered'].includes(r.status) ? 'good' : r.status === 'cancelled' ? 'off' : 'wait';
  const units = Number(r.units) || 0;
  return (
    <li>
      <Link className={s.order} href={`/merch/orders/${r.ref}${r.token ? `?t=${encodeURIComponent(r.token)}` : ''}`}>
        <span className={s.thumb}>
          <SmartImage src={merchCutoutSrc(r.product_id)} alt={product?.label || r.product_id} width={160} height={160} unoptimized
            style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </span>
        <span className={s.orderMain}>
          <span className={s.orderTop}>
            <strong className={s.orderRef}>{r.ref}</strong>
            <span className={s.pill} data-tone={tone}>{orderStatusLabel(r.status, r.delivery)}</span>
          </span>
          <span className={s.orderMeta}>
            {product?.label || r.product_id}{r.color ? ` · ${merchColorName(r.product_id, r.color)}` : ''} · {units} item{units === 1 ? '' : 's'} · {new Date(r.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          {step >= 0 && r.status !== 'cancelled' && (
            <span className={s.bar} role="img" aria-label={`Step ${step + 1} of ${ORDER_STEPS.length}`}>
              {ORDER_STEPS.map((st, i) => <span key={st.id} data-on={i <= step ? 'true' : undefined} />)}
            </span>
          )}
        </span>
        <span className={s.orderEnd}>
          <span className={s.orderTotal}>{nzd(r.total_cents)}</span>
          <span className={s.chev} aria-hidden="true">→</span>
        </span>
      </Link>
    </li>
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
      <p className={s.muted}>Enter the email you ordered with. We send you a link to each of your recent orders.</p>
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
