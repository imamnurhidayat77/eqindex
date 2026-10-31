'use client';
import Link from 'next/link';

import { useEffect, useState } from 'react';
import { API } from '../lib/api';
import { removeFromCart, useCart } from '../lib/cart';
import { buildCombinedBody, splitCartItems } from '../lib/checkout.mjs';
import { checkoutBase, newIdempotencyKey, nzd, stripeCheckoutUrl } from '../lib/figma-data';
import { safeError } from '../lib/errors';
import { Icon, SiteFooter, SiteHeader } from './figma';
import SmartImage from './SmartImage';
import { useToast } from './Toaster';
import { useAuthed } from '../lib/use-authed';

export default function CartClient() {
  const toast = useToast();
  const [items] = useCart();
  const { user: meUser } = useAuthed();
  const meEmail = meUser?.email || null;
  const [busyKey, setBusyKey] = useState(null);
  const [err, setErr] = useState('');
  const [balance, setBalance] = useState(0);
  // Guests check out with just an email (no account needed) — it doubles as
  // the receipt address and the key to claim downloads later.
  const [email, setEmail] = useState('');
  useEffect(() => {
    if (meEmail && !email) setEmail(meEmail);
  }, [meEmail, email]);

  useEffect(() => {
    fetch(`${API}/api/my/wallet`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((w) => setBalance(Number(w?.data?.balance_cents) || 0))
      .catch(() => {});
  }, []);

  const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
  // Guests pay with just an email; the backend validates it strictly.
  const checkoutEmail = () => {
    const em = (email || meEmail || '').trim();
    if (!validEmail(em)) {
      setErr(meEmail ? 'Enter your email to receive the receipt.' : 'Enter your email — no account needed. Receipt and download access go there.');
      return null;
    }
    return em;
  };

  const photoItems = items.filter((it) => it.kind !== 'reel' && it.mediaId);
  const reelItems = items.filter((it) => it.kind === 'reel');
  // One button pays the whole cart: photos and pre-books go through a
  // single Stripe session (/api/checkout/combined).
  const subtotal = items.reduce((t, it) => t + Number(it.priceCents || 0), 0);
  // Wallet balance only ever covers the photos portion (reels go on card).
  const photoTotal = photoItems.reduce((t, it) => t + Number(it.priceCents || 0), 0);
  const gst = Math.round((subtotal / 1.15) * 0.15);

  const genKey = newIdempotencyKey;

  // Buying requires an account — receipt goes to the account email,
  // downloads live in My media. Backend enforces this too (401 otherwise).
  async function buyMedia(item) {
    const em = checkoutEmail();
    if (!em) return;
    setBusyKey(item.key); setErr('');
    try {
      const res = await fetch(`${API}/api/checkout`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...checkoutBase(), media_id: item.mediaId, license_tier: item.tierId,
          cancel_path: `/p/${item.mediaId}`,
          email: em, idempotency_key: newIdempotencyKey(),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Checkout failed — try again.');
      removeFromCart(item.key);
      window.location.assign(stripeCheckoutUrl(j.data));
    } catch (e) { setErr(e.message); setBusyKey(null); }
  }

  async function buyReel(item) {
    const em = checkoutEmail();
    if (!em) return;
    setBusyKey(item.key); setErr('');
    try {
      const res = await fetch(`${API}/api/reel-orders`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...checkoutBase(), ...item.reelPayload, email: em }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Order failed — try again.');
      removeFromCart(item.key);
      if (j.data?.checkout_url) window.location.assign(stripeCheckoutUrl(j.data));
    } catch (e) { setErr(e.message); setBusyKey(null); }
  }

  async function payAll() {
    const em = checkoutEmail();
    if (!em) return;
    if (!items.length || busyKey) return;
    setBusyKey('__all'); setErr('');
    try {
      const use_balance_cents = meEmail ? Math.min(balance, photoTotal) : 0;
      const res = await fetch(`${API}/api/checkout/combined`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...checkoutBase(),
          items: photoItems.map((it) => ({ media_id: it.mediaId, license_tier: it.tierId })),
          reels: reelItems.map((it) => it.reelPayload),
          cancel_path: '/cart', email: em, idempotency_key: genKey(),
          ...(use_balance_cents ? { use_balance_cents } : {}),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Checkout failed — try again.');
      items.forEach((it) => removeFromCart(it.key));
      if (j.data?.paid && j.data?.purchase_ids?.length) {
        window.location.assign(`/photos/success?purchases=${j.data.purchase_ids.join(',')}`);
        return;
      }
      if (!j.data?.checkout_url) throw new Error('Checkout already started — check your email for the payment link.');
      window.location.assign(stripeCheckoutUrl(j.data));
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
                  {item.image ? <SmartImage src={item.image} alt={item.name || item.detail || `${item.type || 'Cart'} photo`} width={340} height={290} /> : <span className="cover-fallback" aria-hidden="true">Boss Media</span>}
                  <div>
                    <p>{item.type}</p>
                    <h2>{item.name}</h2>
                    <span>{item.detail}</span>
                    <div className="cart-item-actions">
                      <button onClick={() => { removeFromCart(item.key); toast(`Removed — ${item.name}`, { type: 'info' }); }}>Remove</button>
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
              <label htmlFor="cart-email" style={{ display: 'grid', gap: 8, marginTop: 24 }}>
                <span style={{ color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.09em' }}>Email for receipt{meEmail ? '' : ' — no account needed'}</span>
                <input id="cart-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.nz"
                  style={{ minHeight: 46, padding: '0 12px', color: 'white', background: '#0b0b0b', border: '1px solid #333', outline: 0, fontSize: 13 }} />
              </label>
              <p style={{ margin: '10px 0 0', color: '#888', fontSize: 12, lineHeight: 1.6 }}>
                {meEmail
                  ? <>Receipt to <strong style={{ color: '#ddd' }}>{meEmail}</strong> — downloads live in <Link href="/media" style={{ color: '#fff', borderBottom: '1px solid #555' }}>My media</Link>.</>
                  : <>Receipt and download access go to this email — no account needed.</>}
              </p>
              {err && <p className="auth-error" role="alert" style={{ marginTop: 12 }}>{safeError(err)}{' '}<Link href="/contact" style={{ color: '#fff', borderBottom: '1px solid #555' }}>Need help? Contact support</Link></p>}
              <div className="cart-total"><span>Total</span><strong>{nzd(subtotal)}</strong></div>
              {meEmail && balance > 0 && photoTotal > 0 && (
                <p style={{ margin: '16px 0 0', color: '#ccc', fontSize: 13, lineHeight: 1.5 }}>
                  {nzd(Math.min(balance, photoTotal))} balance applied
                  {Math.min(balance, photoTotal) < subtotal ? ` · ${nzd(subtotal - Math.min(balance, photoTotal))} left by card` : ' · covers it fully'}
                  <span style={{ display: 'block', marginTop: 4, color: '#777', fontSize: 11 }}>Balance payments are final — no refunds to balance.</span>
                </p>
              )}
              <button type="button" className="pay-all" disabled={busyKey}
                onClick={payAll}>
                {busyKey === '__all' ? 'Opening secure checkout…' : (() => {
                  const used = meEmail ? Math.min(balance, photoTotal) : 0;
                  const rest = subtotal - used;
                  if (rest <= 0) return `Pay ${nzd(subtotal)} with balance`;
                  if (used <= 0) return `Pay ${nzd(subtotal)}`;
                  return `Pay ${nzd(rest)} by card · ${nzd(used)} balance`;
                })()}
              </button>
              <p>One secure Stripe checkout for everything — photos unlock instantly, pre-books start production.</p>
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
