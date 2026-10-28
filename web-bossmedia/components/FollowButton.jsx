'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { API } from '../lib/api';

// Follow a horse or rider: get notified when their new photos publish
// (the publish hook already notifies watchlist_items). Members only.
import { Icon } from './figma';
import { toast } from './Toaster';

export default function FollowButton({ kind, id, name, icon = false }) {
  const router = useRouter();
  const pathname = usePathname();
  const [watchId, setWatchId] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!id) { setChecking(false); return; }
    fetch(`${API}/watchlist`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const hit = (j?.data || []).find((w) => w.entity_type === kind && w.entity_id === id);
        setWatchId(hit ? hit.id : null);
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [kind, id]);

  const toggle = async () => {
    try {
      const r = await fetch(`${API}/auth/me`, { credentials: 'include' });
      if (!r.ok) throw new Error('login required');
    } catch {
      router.push(`/login?next=${encodeURIComponent(pathname || '/watchlist')}`);
      return;
    }
    if (watchId) {
      await fetch(`${API}/watchlist/${watchId}`, { method: 'DELETE', credentials: 'include' }).catch(() => {});
      setWatchId(null);
      toast(`Unfollowed ${name}`, { type: 'info' });
      return;
    }
    try {
      const r = await fetch(`${API}/watchlist`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_type: kind, entity_id: id }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.data) {
        setWatchId(j.data.id);
        toast(`Following ${name} — new photos land in your Watchlist`, { action: { label: 'View', href: '/watchlist' } });
      }
    } catch { /* stays unfollowed */ }
  };

  if (!id) return null;
  if (icon) {
    return (
      <button type="button" onClick={toggle} disabled={checking} aria-pressed={!!watchId}
        className={`mini-icon-btn${watchId ? ' on' : ''}`}
        title={watchId ? `Unfollow ${name}` : `Follow ${name} — new photos land in your Watchlist`}
        aria-label={watchId ? `Unfollow ${name}` : `Follow ${name}`}>
        {checking ? '…' : <Icon name={watchId ? 'bell-fill' : 'bell'} size={17} />}
      </button>
    );
  }
  const short = (name || '').split(' ')[0] || (kind === 'horse' ? 'horse' : 'rider');
  return (
    <button type="button" onClick={toggle} disabled={checking} aria-pressed={!!watchId}
      className="text-link" title={watchId ? `Unfollow ${name}` : `Follow ${name} — get notified of new photos`}>
      {checking ? '…' : watchId ? '✓ Following' : `Follow ${short}`}
    </button>
  );
}
