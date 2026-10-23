'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { API } from '../lib/api';
import { removeFromCart, useCart } from '../lib/cart';
import { checkoutBase, nzd } from '../lib/figma-data';
import { Icon, SiteFooter, SiteHeader } from './figma';

export default function CartClient() {
  const router = useRouter();
  const [items] = useCart();
  const [email, setEmail] = useState('');
  const [busyKey, setBusyKey] = useState(null);
  const [err, setErr] = useState('');
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    fetch(`${API}/api/my/wallet`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((w) => setBalance(Number(w?.data?.balance_cents) || 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`${API}/auth/me`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setMeEmail(j?.data?.email || null))
      .catch(() => setMeEmail(null))
      .finally(() => setMeChecked(true));
  }, []);

  const needLogin = () => { router.push('/login?next=/cart'); };

  const subtotal = items.reduce((t, it) => t + Number(it.priceCents || 0), 0);
  const gst = Math.round((subtotal / 1.15) * 0.15);
  const total = subtotal;
  const photoItems = items.filter((it) => it.kind !== 'reel' && it.mediaId);
  const reelItems = items.filter((it) => it.kind === 'reel');
  const photoTotal = photoItems.reduce((t, it) => t + Number(it.priceCents || 0), 0);

  const genKey = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');

  // Buying requires an account — receipt goes to the account email,
  // downloads live in My media. Backend enforces this too (401 otherwise).
  async function buyMedia(item) {
    if (!meEmail) { needLogin(); return; }
    setBusyKey(item.key); setErr('');
    try {
      const res = await fetch(`${API}/api/checkout`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...checkoutBase(), media_id: item.mediaId, license_tier: item.tierId,
          cancel_path: `/p/${item.mediaId}`,
          email: meEmail, idempotency_key: [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join(''),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Checkout failed — try again.');
      removeFromCart(item.key);
      window.location.assign(j.data.checkout_url);
    } catch (e) { setErr(e.message); setBusyKey(null); }
  }

  async function buyReel(item) {
    setBusyKey(item.key); setErr('');
    try {
      const res = await fetch(`${API}/api/reel-orders`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...checkoutBase(), ...item.reelPayload }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Order failed — try again.');
      removeFromCart(item.key);
      if (j.data?.checkout_url) window.location.assign(j.data.checkout_url);
    } catch (e) { setErr(e.message); setBusyKey(null); }
  }

  async function payAll() {
    if (!meEmail) { needLogin(); return; }
    if (!photoItems.length || busyKey) return;
    setBusyKey('__all'); setErr('');
    try {
      const use_balance_cents = Math.min(balance, photoTotal);
      const res = await fetch(`${API}/api/checkout/batch`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...checkoutBase(),
          items: photoItems.map((it) => ({ media_id: it.mediaId, license_tier: it.tierId })),
          cancel_path: '/cart', email: meEmail, idempotency_key: genKey(),
          ...(use_balance_cents ? { use_balance_cents } : {}),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Checkout failed — try again.');
      photoItems.forEach((it) => removeFromCart(it.key));
      if (j.data?.paid && j.data?.purchase_ids?.length) {
        window.location.assign(`/photos/success?purchases=${j.data.purchase_ids.join(',')}`);
        return;
      }
      if (!j.data?.checkout_url) throw new Error('Checkout already started — check your email for the payment link.');
      window.location.assign(j.data.checkout_url);
    } catch (e) { setErr(e.message); setBusyKey(null); }
  }

  return (
    <div className="cart-page">
      <SiteHeader />
      <main className="cart-shell section-gutter">
        <div className="cart-heading">
          <div>
            <p className="eyebrow">Your selection</p>
            <h1>Cart.</h1>
          </div>
          <p>{items.length} items</p>
        </div>
        {items.length ? (
          <div className="cart-layout">
            <div className="cart-items">
              <div className="cart-list-heading"><span>Item</span><span>Details</span><span>Price</span></div>
              {items.map((item, i) => (
                <article className="cart-item" key={item.key}>
                  <span className="cart-item-number">0{i + 1}</span>
                  {item.image ? <img src={item.image} alt={item.name} /> : <span className="cover-fallback" aria-hidden="true">Boss Media</span>}
                  <div>
                    <p>{item.type}</p>
                    <h2>{item.name}</h2>
                    <span>{item.detail}</span>
                    <div className="cart-item-actions">
                      <button onClick={() => removeFromCart(item.key)}>Remove</button>
                      {!meChecked ? (
                        <button disabled>Buy now</button>
                      ) : !meEmail ? (
                        <Link href="/login?next=/cart">Buy now</Link>
                      ) : (
                        <button disabled={busyKey === item.key}
                          onClick={() => (item.kind === 'reel' ? buyReel(item) : buyMedia(item))}>
                          {busyKey === item.key ? 'Opening…' : 'Buy now'}
                        </button>
                      )}
                    </div>
                  </div>
                  <strong>{nzd(item.priceCents)}</strong>
                </article>
              ))}
              <Link href="/events" className="continue-shopping">← Continue browsing galleries</Link>
            </div>
            <aside className="cart-summary">
              <p className="eyebrow">Order summary</p>
              <dl>
                <div><dt>Subtotal</dt><dd>{nzd(subtotal)}</dd></div>
                <div><dt>Delivery</dt><dd>Digital</dd></div>
                <div><dt>GST included</dt><dd>{nzd(gst)}</dd></div>
              </dl>
              {meEmail ? (
                <p style={{ margin: '24px 0 0', color: '#888', fontSize: 12, lineHeight: 1.6 }}>
                  Receipt to <strong style={{ color: '#ddd' }}>{meEmail}</strong> — downloads live in <Link href="/media" style={{ color: '#fff', borderBottom: '1px solid #555' }}>My media</Link>.
                </p>
              ) : (
                <p style={{ margin: '24px 0 0', color: '#888', fontSize: 12, lineHeight: 1.6 }}>
                  <Link href="/login?next=/cart" style={{ color: '#fff', borderBottom: '1px solid #555' }}>Sign in</Link> to check out — downloads live in My media.
                </p>
              )}
              {err && <p className="auth-error" role="alert" style={{ marginTop: 12 }}>{err}</p>}
              <div className="cart-total"><span>Total</span><strong>{nzd(total)}</strong></div>
              {meEmail && balance > 0 && photoTotal > 0 && (
                <p style={{ margin: '16px 0 0', color: '#ccc', fontSize: 13, lineHeight: 1.5 }}>
                  {nzd(Math.min(balance, photoTotal))} balance applied
                  {Math.min(balance, photoTotal) < photoTotal ? ` · ${nzd(photoTotal - Math.min(balance, photoTotal))} left by card` : ' · covers it fully'}
                  <span style={{ display: 'block', marginTop: 4, color: '#777', fontSize: 11 }}>Balance payments are final — no refunds to balance.</span>
                </p>
              )}
              {!meChecked ? (
                <button type="button" className="pay-all" disabled>Checking…</button>
              ) : !meEmail ? (
                <Link href="/login?next=/cart" className="pay-all" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>Sign in to check out</Link>
              ) : !!photoItems.length && (
                <button type="button" className="pay-all" disabled={busyKey}
                  onClick={payAll}>
                  {busyKey === '__all' ? 'Opening secure checkout…' : (() => {
                    const used = Math.min(balance, photoTotal);
                    const rest = photoTotal - used;
                    if (rest <= 0) return `Pay ${nzd(photoTotal)} with balance`;
                    if (used <= 0) return photoItems.length === items.length && !reelItems.length
                      ? `Pay ${nzd(photoTotal)}`
                      : `Pay ${photoItems.length} photo${photoItems.length === 1 ? '' : 's'} · ${nzd(photoTotal)}`;
                    return `Pay ${nzd(rest)} by card · ${nzd(used)} balance`;
                  })()}
                </button>
              )}
              <p>{reelItems.length
                ? 'Photos pay together above — each reel needs its own Buy now (it starts a production order).'
                : 'One secure Stripe checkout for everything — no per-item payments.'}</p>
              <div className="cart-trust"><span>Secure payment</span><span>Instant delivery</span><span>NZ support</span></div>
            </aside>
          </div>
        ) : (
          <div className="cart-empty">
            <p className="eyebrow">Your cart is empty</p>
            <h2>Find a moment worth keeping.</h2>
            <div>
              <Link href="/events">Browse galleries <Icon name="arrow" size={17} /></Link>
              <Link href="/pre-book">Pre-book coverage</Link>
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
