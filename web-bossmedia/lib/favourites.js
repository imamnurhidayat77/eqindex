'use client';
// Device-local favourites (photos + reels, members only) — mirrors lib/cart.
// Login is enforced at the UI layer (page + save buttons), not here.
import { useEffect, useState } from 'react';

const KEY = 'bossmedia:favourites';

export function readFavourites() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function writeFavourites(ids) {
  localStorage.setItem(KEY, JSON.stringify(ids));
  window.dispatchEvent(new CustomEvent('bm-fav'));
}

export function favCount() {
  try {
    return readFavourites().length;
  } catch { return 0; }
}

export function onFavChange(fn) {
  window.addEventListener('bm-fav', fn);
  window.addEventListener('storage', fn);
  return () => {
    window.removeEventListener('bm-fav', fn);
    window.removeEventListener('storage', fn);
  };
}

// Add-only (detail page): returns true when newly saved.
export function addFavourite(id) {
  const ids = readFavourites();
  if (ids.includes(id)) return false;
  writeFavourites([...ids, id]);
  return true;
}

// Toggle: returns true when now saved.
export function toggleFavourite(id) {
  const ids = readFavourites();
  const has = ids.includes(id);
  writeFavourites(has ? ids.filter((x) => x !== id) : [...ids, id]);
  return !has;
}

export function removeFavourite(id) {
  writeFavourites(readFavourites().filter((x) => x !== id));
}

export function useIsFavourite(id) {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setSaved(readFavourites().includes(id));
    return onFavChange(() => setSaved(readFavourites().includes(id)));
  }, [id]);
  return saved;
}
