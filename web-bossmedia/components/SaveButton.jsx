'use client';
import { usePathname, useRouter } from 'next/navigation';
import { toggleFavourite, useIsFavourite } from '../lib/favourites';
import { API } from '../lib/api';
import { Icon } from './figma';

// Round overlay bookmark for gallery cards. Sibling of the card link
// (never nested inside it) — parent card needs position: relative.
// Members only: guests are sent to login first (favourites are personal).
export default function SaveButton({ id, label = 'Save to favourites' }) {
  const router = useRouter();
  const pathname = usePathname();
  const saved = useIsFavourite(id);
  const onClick = async () => {
    try {
      const r = await fetch(`${API}/auth/me`, { credentials: 'include' });
      if (!r.ok) throw new Error('login required');
    } catch {
      router.push(`/login?next=${encodeURIComponent(pathname || '/favourites')}`);
      return;
    }
    toggleFavourite(id);
  };
  return (
    <button type="button" onClick={onClick}
      aria-label={saved ? 'Remove from favourites' : label} aria-pressed={saved}
      style={{ position: 'absolute', top: 17, right: 17, zIndex: 2, width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: '50%', border: '1px solid rgba(255,255,255,.6)', background: 'rgba(0,0,0,.6)', color: '#fff', cursor: 'pointer' }}>
      <Icon name={saved ? 'heart-fill' : 'heart'} size={15} />
    </button>
  );
}
