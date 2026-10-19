'use client';
import { useEffect, useState } from 'react';
import { API } from '../lib/api';
import { INP } from '../lib/tokens';
import { useAuth } from './auth';

const nzd = (c) => `NZ$${(Number(c || 0) / 100).toFixed(2)}`;
// Early-bird (P1b): admin-set discounted price honored while active.
const earlyOf = (pk) => {
  if (pk.early_price_cents === null || pk.early_price_cents === undefined) return null;
  if (pk.early_until && new Date(pk.early_until) <= new Date()) return null;
  return Number(pk.early_price_cents);
};
const earlyLeft = (pk) => {
  if (!pk.early_until) return '';
  const days = Math.ceil((new Date(pk.early_until) - new Date()) / 86400000);
  if (days <= 0) return '';
  return days === 1 ? 'ends tomorrow' : `ends in ${days} days`;
};
const keyFor = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 32)
  : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 20)}`);

export default function PackageUpsell({ eventId, horseId, riderId, horse, rider }) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [idem] = useState(() => keyFor);
  useEffect(() => {
    if (!eventId || (!horseId && !riderId)) return;
    const p = new URLSearchParams({ event_id: eventId });
    if (horseId) p.set('horse_id', horseId); else p.set('rider_id', riderId);
    fetch(`${API}/photos/packages?${p}`).then((r) => r.json()).then((j) => setRows(j.data || [])).catch(() => {});
  }, [eventId, horseId, riderId]);
  if (!rows.length) return null;

  async function buy(pk) {
    if (busyId) return;
    setErr('');
    const em = (user?.email || email).trim();
    if (!em) { setErr('Enter your email for delivery.'); return; }
    setBusyId(pk.id);
    try {
      const res = await fetch(`${API}/api/checkout`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package_id: pk.id, email: em, idempotency_key: idem() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      if (!j.data?.checkout_url) throw new Error('Checkout already started — check your email for the payment link.');
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
            <div className="text-[11px] text-faint">
              {Number(pk.reels) > 0
                ? `${Number(pk.items) - Number(pk.reels)} photos · ${pk.reels} reel${Number(pk.reels) === 1 ? '' : 's'} · `
                : `${pk.items} photos · `}
              {earlyOf(pk) !== null ? (
                <><s>{nzd(pk.price_cents)}</s> <b className="text-gold">{nzd(earlyOf(pk))}</b> <span className="text-gold">early-bird{earlyLeft(pk) ? ` · ${earlyLeft(pk)}` : ''}</span></>
              ) : nzd(pk.price_cents)}
            </div>
          </div>
          <button onClick={() => buy(pk)} disabled={!!busyId}
            className="bg-gold text-black font-bold rounded px-3.5 py-2 text-[13px] hover:brightness-110 shrink-0">
            {busyId === pk.id ? '…' : 'Get all'}
          </button>
        </div>
      ))}
      {!user?.email && (
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email for delivery"
          type="email" className={`${INP} w-full mt-2 !text-[13px]`} />
      )}
      {err && <p className="text-blood text-[12px] mt-1">{err}</p>}
    </div>
  );
}
