'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API } from '../lib/api';
import { useAuth } from './auth';
import { useDismiss } from './useDismiss';

// Header notification bell (P1b): unread in-app notifications
// (package top-ups, photos-live). Email digests follow in P3.
export default function NotificationBell() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const wrapRef = useDismiss(open, () => setOpen(false));

  async function load() {
    if (!user) return;
    try {
      const r = await fetch(`${API}/api/my/notifications?limit=10`, { credentials: 'include' });
      if (!r.ok) return;
      const j = await r.json();
      setItems(Array.isArray(j.data) ? j.data : []);
      setUnread(Number(j.unread) || 0);
    } catch { /* bell optional */ }
  }
  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function markAll() {
    try {
      await fetch(`${API}/api/my/notifications/read`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      setUnread(0);
      setItems((xs) => xs.map((x) => ({ ...x, read_at: x.read_at || new Date().toISOString() })));
    } catch { /* ignore */ }
  }

  if (!user) return null;
  return (
    <div className="relative" ref={wrapRef}>
      <button onClick={() => { setOpen((o) => !o); if (!open) load(); }} aria-label="Notifications"
        className="relative rounded-md border border-line bg-card px-2.5 py-1.5 text-[15px] text-muted hover:text-white cursor-pointer">
        🔔
        {!!unread && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-black text-[10.5px] font-extrabold inline-flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-[110%] z-30 w-[320px] rounded-lg border border-line bg-card p-2 shadow-xl">
          <div className="flex items-center justify-between px-1.5 py-1">
            <span className="text-[12px] font-bold text-white">Notifications</span>
            {!!unread && (
              <button onClick={markAll} className="text-sky text-[12px] bg-none border-0 cursor-pointer hover:underline">Mark all read</button>
            )}
          </div>
          {!items.length && <p className="px-1.5 py-3 text-[12.5px] text-faint">Nothing yet — new photos of your stable land here.</p>}
          {items.map((n) => (
            <Link key={n.id} href={n.link || '/watchlist'} onClick={() => setOpen(false)}
              className={`block rounded px-1.5 py-2 no-underline hover:bg-white/5 ${n.read_at ? '' : 'bg-goldbg/10'}`}>
              <div className="text-[13px] font-bold text-white">
                {n.title}{Number(n.count) > 1 && <span className="text-gold"> ×{n.count}</span>}
              </div>
              {!!n.body && <div className="text-[12px] text-muted">{n.body}</div>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
