'use client';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { API } from '../lib/api';

export default function WatchButton({ entityType, entityId }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState('＋ Watch');
  async function add() {
    const res = await fetch(`${API}/watchlist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type: entityType, entity_id: entityId }),
    });
    if (res.status === 401) { router.push(`/login?next=${encodeURIComponent(pathname || '/watchlist')}`); return; }
    setState(res.ok ? '✓ Watching' : 'Failed');
  }
  return <button className="bg-card2 border border-line text-body rounded px-3.5 py-2 text-sm" onClick={add}>{state}</button>;
}
