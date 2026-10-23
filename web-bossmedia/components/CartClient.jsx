'use client';
import Link from 'next/link';
import { useState } from 'react';
import { API } from '../lib/api';
import { removeFromCart, useCart } from '../lib/cart';
import { checkoutBase, nzd } from '../lib/figma-data';
import { Icon, SiteFooter, SiteHeader } from './figma';

export default function CartClient() {
  const [items] = useCart();
  const [email, setEmail] = useState('');
  const [busyKey, setBusyKey] = useState(null);
  const [err, setErr] = useState('');

  const subtotal = items.reduce((t, it) => t + Number(it.priceCents || 0), 0);
  const gst = Math.round((subtotal / 1.15) * 0.15);
  const total = subtotal;

  async function buyMedia(item) {
    if (!email.trim()) { setErr('Enter your email to receive download links.'); return; }
    setBusyKey(item.key); setErr('');
    try {
      const res = await fetch(`${API}/api/checkout`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...checkoutBase(), media_id: item.mediaId, license_tier: item.tierId,
          cancel_path: `/p/${item.mediaId}`,
          email: email.trim(), idempotency_key: [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join(''),
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
                      <button disabled={busyKey === item.key}
                        onClick={() => (item.kind === 'reel' ? buyReel(item) : buyMedia(item))}>
                        {busyKey === item.key ? 'Opening…' : 'Buy now'}
                      </button>
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
              <label style={{ display: 'grid', gap: 8, marginTop: 24 }}>
                <span style={{ color: '#777', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.09em' }}>Email for delivery</span>
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.nz" type="email"
                  style={{ height: 46, padding: '0 12px', color: 'white', background: '#0c0c0c', border: '1px solid #333', outline: 0, fontSize: 13 }} />
              </label>
              {err && <p className="auth-error" role="alert" style={{ marginTop: 12 }}>{err}</p>}
              <div className="cart-total"><span>Total</span><strong>{nzd(total)}</strong></div>
              <p>Pay per item with secure Stripe checkout — use Buy now on each row.</p>
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
