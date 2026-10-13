'use client';
import { useEffect, useState } from 'react';
import { API } from '../lib/api';

const nzd = (c) => `$${(Number(c || 0) / 100).toFixed(2)}`;

export default function PackageUpsell({ eventId, horseId, riderId, horse, rider }) {
  const [rows, setRows] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!eventId || (!horseId && !riderId)) return;
    const p = new URLSearchParams({ event_id: eventId });
    if (horseId) p.set('horse_id', horseId); else p.set('rider_id', riderId);
    fetch(`${API}/photos/packages?${p}`).then((r) => r.json()).then((j) => setRows(j.data || [])).catch(() => {});
  }, [eventId, horseId, riderId]);
  if (!rows.length) return null;

  async function buy(pk) {
    setErr('');
    setBusyId(pk.id);
    try {
      const em = prompt('Email for delivery:');
      if (!em) { setBusyId(null); return; }
      const res = await fetch(`${API}/api/checkout`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package_id: pk.id, email: em.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      window.location.assign(j.data.checkout_url);
    } catch (e) { setErr(e.message); setBusyId(null); }
  }

  return (
    <div className="mt-3 rounded border border-gold/40 bg-card2 p-3">
      <div className="text-[11px] uppercase tracking-wide text-gold font-bold mb-2">All photos package</div>
      {rows.map((pk) => (
        <div key={pk.id} className="flex items-center justify-between gap-2 py-1">
          <div className="text-[13px]">
            <b>{pk.title}</b>
            <div className="text-[11px] text-faint">{pk.items} photos · {nzd(pk.price_cents)}</div>
          </div>
          <button onClick={() => buy(pk)} disabled={!!busyId}
            className="bg-gold text-black font-bold rounded px-3.5 py-2 text-[13px] hover:brightness-110 shrink-0">
            {busyId === pk.id ? '…' : 'Get all'}
          </button>
        </div>
      ))}
      {err && <p className="text-blood text-[12px] mt-1">{err}</p>}
    </div>
  );
}
