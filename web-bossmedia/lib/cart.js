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

export function useCart() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    setItems(readCart());
    return onCartChange(() => setItems(readCart()));
  }, []);
  return [items, { addToCart, removeFromCart, clearCart }];
}
