'use client';
import { useEffect, useState } from 'react';
import { IconHeart } from './icons';

const KEY = 'bossmedia:favourites';

// Heart toggle persisted in localStorage. No account needed.
export function useFavourites() {
  const [ids, setIds] = useState([]);
  useEffect(() => {
    try { setIds(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch {}
  }, []);
  const toggle = (id) => {
    setIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  return { ids, toggle, has: (id) => ids.includes(id) };
}

export default function FavButton({ id, label = 'Save to favourites' }) {
  const { has, toggle } = useFavourites();
  const on = has(id);
  return (
    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(id); }}
      aria-label={label} aria-pressed={on} title={label}
      style={{
        position: 'absolute', top: 10, right: 10, width: 36, height: 36,
        borderRadius: '50%', border: '1px solid rgba(255,255,255,.7)', cursor: 'pointer',
        background: on ? '#1F3D2E' : 'rgba(10,10,10,.45)', color: '#fff',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
      <IconHeart filled={on} />
    </button>
  );
}
