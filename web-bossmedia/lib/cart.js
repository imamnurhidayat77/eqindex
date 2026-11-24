'use client';
// Local-first cart (backend has direct Stripe checkout, no server cart).
// Items: { key, kind: 'media'|'reel', image, type, name, detail, priceCents,
//           mediaId?, tierId?, tierLabel?, reelPayload? }
import { useEffect, useState } from 'react';

const KEY = 'bossmedia:cart';

export function readCart() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function writeCart(items) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('bm-cart'));
}

export function cartCount() {
  try {
    return readCart().length;
  } catch { return 0; }
}

export function onCartChange(fn) {
  window.addEventListener('bm-cart', fn);
  window.addEventListener('storage', fn);
  return () => {
    window.removeEventListener('bm-cart', fn);
    window.removeEventListener('storage', fn);
  };
}

export function addToCart(item) {
  const items = readCart();
  if (!items.some((x) => x.key === item.key)) items.push(item);
  writeCart(items);
}

export function removeFromCart(key) {
  writeCart(readCart().filter((x) => x.key !== key));
}

export function clearCart() {
  writeCart([]);
}

// Items stay in the cart until payment is confirmed: a buyer who cancels on
// Stripe must come back to a full cart. Checkout records which cart keys
// belong to which purchase ids; the success page settles them once paid.
const PENDING_KEY = 'bossmedia:cart-pending';

export function markCartPending(purchaseIds, keys) {
  const ids = (purchaseIds || []).filter(Boolean).map(String);
  if (!ids.length || !keys?.length) return;
  try { localStorage.setItem(PENDING_KEY, JSON.stringify({ ids, keys })); } catch { /* storage full or blocked */ }
}

// Removes the pending items when any of their purchase ids is paid.
export function settleCartPending(paidIds) {
  try {
    const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
    const paid = new Set((paidIds || []).map(String));
    if (!pending?.ids?.some((id) => paid.has(id))) return false;
    const drop = new Set(pending.keys);
    writeCart(readCart().filter((x) => !drop.has(x.key)));
    localStorage.removeItem(PENDING_KEY);
    return true;
  } catch { return false; }
}

export function useCart() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    setItems(readCart());
    return onCartChange(() => setItems(readCart()));
  }, []);
  return [items, { addToCart, removeFromCart, clearCart }];
}
