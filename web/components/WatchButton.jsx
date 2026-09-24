'use client';
import { useState } from 'react';
import { API, DEMO_USER } from '../lib/api';

export default function WatchButton({ entityType, entityId }) {
  const [state, setState] = useState('＋ Watch');
  async function add() {
    const res = await fetch(`${API}/watchlist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: DEMO_USER, entity_type: entityType, entity_id: entityId }),
    });
    setState(res.ok ? '✓ Watching' : 'Failed');
  }
  return <button className="bg-card2 border border-line text-body rounded px-3.5 py-2 text-sm" onClick={add}>{state}</button>;
}
