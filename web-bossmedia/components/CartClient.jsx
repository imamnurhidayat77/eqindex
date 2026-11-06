'use client';
import Link from 'next/link';

import { useEffect, useState } from 'react';
import { API } from '../lib/api';
import { removeFromCart, useCart } from '../lib/cart';
import { checkoutBase, newIdempotencyKey, nzd, stripeCheckoutUrl } from '../lib/figma-data';
import { safeError } from '../lib/errors';
import { isValidEmail, normalizeEmail } from '../lib/validation.mjs';
import { Icon, SiteFooter, SiteHeader } from './figma';
import SmartImage from './SmartImage';
import s from './CartClient.module.css';
import { templateOf } from './SponsorTemplates';
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
  // Sponsor discount estimate per item — mirrors the product page rule
  // (best funded budget among the chosen logos' sponsors, capped). The
  // server recomputes the real discount at checkout; cart never charges.
  const [logos, setLogos] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  useEffect(() => {
    fetch(`${API}/api/sponsor-logos`)
      .then((r) => r.json())
      .then((j) => setLogos(j?.data || []))
      .catch(() => {});
    fetch(`${API}/api/sponsor-discounts`)
      .then((r) => r.json())
      .then((j) => setDiscounts(j?.data || []))
      .catch(() => {});
  }, []);
  const discForItem = (item) => {
    if (item.kind === 'reel' || !Array.isArray(item.logoIds) || !item.logoIds.length) return null;
    const picked = item.logoIds
      .map((id) => logos.find((l) => String(l.id) === String(id)))
      .filter(Boolean);
    const names = picked.map((l) => l.sponsor_name).filter(Boolean);
    const cands = discounts.filter((d) => names.includes(d.sponsor_name));
    if (!cands.length) return null;
    const best = cands.reduce((a, b) => (Number(b.discount_cents) > Number(a.discount_cents) ? b : a));
    const gross = Number(item.priceCents) || 0;
    const cents = Math.min(Number(best.discount_cents) || 0, Math.max(0, gross - 1));
    if (!cents) return null;
    // Label pemakai logo yang dipilih pembeli, bukan nama record sponsor.
    return { cents, label: picked[0]?.label || null };
  };
  const lineTotal = (item) => Math.max(0, (Number(item.priceCents) || 0) - (discForItem(item)?.cents || 0));

  // Guests pay with just an email; the backend validates it strictly.
  const checkoutEmail = () => {
    const em = normalizeEmail(email || meEmail || '');
    if (!isValidEmail(em)) {
      setErr(meEmail ? 'Enter your email to receive the receipt.' : 'Enter your email — no account needed. Receipt and download access go there.');
      return null;
    }
    return em;
  };

  // Lanes for the combined session: photos need both ids the backend
  // requires, reels travel as opaque pre-book payloads. Half-formed rows
  // are skipped instead of failing the whole checkout.
  const photoItems = items.filter((it) => it.kind !== 'reel' && it.mediaId && it.tierId);
  const reelItems = items.filter((it) => it.kind === 'reel' && it.reelPayload);
  // One button pays the whole cart: photos and pre-books go through a
  // single Stripe session (/api/checkout/combined).
  const subtotal = items.reduce((t, it) => t + lineTotal(it), 0);
  // Wallet balance only ever covers the photos portion (reels go on card).
  const photoTotal = photoItems.reduce((t, it) => t + lineTotal(it), 0);
  const hasDiscount = items.some((it) => discForItem(it));
  const gst = Math.round((subtotal / 1.15) * 0.15);

  const genKey = newIdempotencyKey;

  // Back to the product page. Items added before href existed fall back
  // to the short media URL. The image link is a mouse-only duplicate of
  // the name link (aria-hidden), so it never double-announces.
  const itemHref = (item) => item.href || (item.mediaId ? `/p/${item.mediaId}` : null);

  // Single items go through their own endpoints; the combined session
  // below pays for the whole cart at once.
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
          ...(Array.isArray(item.logoIds) && item.logoIds.length ? { sponsor_logo_ids: item.logoIds, ...(item.logoPos ? { sponsor_logo_positions: item.logoPos } : {}), ...(item.logoTemplate ? { sponsor_logo_template: templateOf(item.logoTemplate), sponsor_logo_variant: item.logoTemplate } : {}), ...(item.logoTheme === 'dark' ? { sponsor_logo_theme: 'dark' } : {}) } : {}),
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
    if (!photoItems.length && !reelItems.length) {
      setErr('Nothing here can be checked out — remove the incomplete items and try again.');
      return;
    }
    setBusyKey('__all'); setErr('');
    try {
      const use_balance_cents = meEmail ? Math.min(balance, photoTotal) : 0;
      const res = await fetch(`${API}/api/checkout/combined`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...checkoutBase(),
          items: photoItems.map((it) => ({
            media_id: it.mediaId, license_tier: it.tierId,
            ...(Array.isArray(it.logoIds) && it.logoIds.length ? {
              sponsor_logo_ids: it.logoIds,
              ...(it.logoPos ? { sponsor_logo_positions: it.logoPos } : {}),
              ...(it.logoTemplate ? { sponsor_logo_template: templateOf(it.logoTemplate), sponsor_logo_variant: it.logoTemplate } : {}),
              ...(it.logoTheme ? { sponsor_logo_theme: it.logoTheme } : {}),
            } : {}),
          })),
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
                  {item.image ? (
                    itemHref(item) ? (
                      <Link href={itemHref(item)} className={s.thumb} aria-hidden="true" tabIndex={-1}>
                        <SmartImage src={item.image} alt={item.name || item.detail || `${item.type || 'Cart'} photo`} width={340} height={290} />
                      </Link>
                    ) : (
                      <SmartImage src={item.image} alt={item.name || item.detail || `${item.type || 'Cart'} photo`} width={340} height={290} />
                    )
                  ) : <span className="cover-fallback" aria-hidden="true">Boss Media</span>}
                  <div>
                    <p>{item.type}</p>
                    <h2>{itemHref(item) ? <Link href={itemHref(item)}>{item.name}</Link> : item.name}</h2>
                    <span>{item.detail}</span>
                    {(() => { const d = discForItem(item); return d ? <span style={{ display: 'block', marginTop: 4, color: '#8fd694' }}>−{nzd(d.cents)}{d.label ? ` ${d.label}` : ''} sponsor discount</span> : null; })()}
                    <div className="cart-item-actions">
                      <button onClick={() => { removeFromCart(item.key); toast(`Removed — ${item.name}`, { type: 'info' }); }}>Remove</button>
                      <button disabled={busyKey === item.key}
                        onClick={() => (item.kind === 'reel' ? buyReel(item) : buyMedia(item))}>
                        {busyKey === item.key ? 'Opening…' : 'Buy now'}
                      </button>
                    </div>
                  </div>
                  <strong>{nzd(lineTotal(item))}</strong>
                </article>
              ))}
              <Link href="/events" className="continue-shopping">← Continue browsing galleries</Link>
            </div>
            <aside className="cart-summary">
              <p className="eyebrow">Order summary</p>
              <dl>
                <div><dt>Subtotal</dt><dd>{nzd(subtotal)}</dd></div>
                {hasDiscount && <div><dt style={{ color: '#8fd694' }}>Sponsor discount</dt><dd style={{ color: '#8fd694' }}>applied ✓</dd></div>}
                <div><dt>Delivery</dt><dd>Digital</dd></div>
                <div><dt>GST included</dt><dd>{nzd(gst)}</dd></div>
              </dl>
              {hasDiscount && <p style={{ margin: '10px 0 0', color: '#777', fontSize: 11, lineHeight: 1.5 }}>Discount estimated from sponsor budgets — final total confirmed at checkout.</p>}
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
