'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { API } from '../lib/api';
import { useFocusTrap } from '../lib/focus-trap';
import { Icon } from './figma';
import s from './NotificationBell.module.css';

// Header bell: unread in-app notifications (new photos of followed riders,
// horses and events, plus order and payment updates from api lib/orderNotify).
export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useFocusTrap(panelRef, { onClose: close, active: open });

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/my/notifications?limit=10`, { credentials: 'include' });
      if (!r.ok) return;
      const j = await r.json();
      setItems(Array.isArray(j.data) ? j.data : []);
      setUnread(Number(j.unread) || 0);
    } catch { /* bell is optional */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  // keepalive: a clicked notification navigates away, the request must still land.
  function postRead(ids) {
    return fetch(`${API}/api/my/notifications/read`, {
      method: 'POST', credentials: 'include', keepalive: true,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ids ? { ids } : {}),
    }).catch(() => { /* stays unread, retried on the next click */ });
  }

  function markAll() {
    postRead(null);
    setUnread(0);
    setItems((xs) => xs.map((x) => ({ ...x, read_at: x.read_at || new Date().toISOString() })));
  }

  // Opening one: the badge drops at once, the server records it in the background.
  function openItem(n) {
    close();
    if (n.read_at) return;
    postRead([n.id]);
    setUnread((u) => Math.max(0, u - 1));
    setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
  }

  return (
    <div className={s.wrap}>
      <button type="button" className="icon-button" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open} aria-haspopup="dialog" onClick={() => { if (!open) load(); setOpen((o) => !o); }}>
        <Icon name="bell" />
        {!!unread && <b className={s.badge} aria-hidden="true">{unread > 9 ? '9+' : unread}</b>}
      </button>
      {open && (
        <>
          <button type="button" className="acct-scrim" aria-label="Close notifications" onClick={close} tabIndex={-1} />
          <div className={s.panel} ref={panelRef} role="dialog" aria-label="Notifications">
            <div className={s.head}>
              <span>Notifications</span>
              {!!unread && <button type="button" className={s.markAll} onClick={markAll}>Mark all read</button>}
            </div>
            {!items.length && <p className={s.empty}>Nothing yet. Follow a rider, horse or event and new photos land here.</p>}
            {items.map((n) => (
              <Link key={n.id} href={n.link || '/watchlist'} onClick={() => openItem(n)} className={`${s.item} ${n.read_at ? '' : s.unread}`}>
                <div className={s.title}>{n.title}{Number(n.count) > 1 && <span className={s.count}> ×{n.count}</span>}</div>
                {!!n.body && <div className={s.body}>{n.body}</div>}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
