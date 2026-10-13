'use client';
import { useState } from 'react';
import { API } from '../lib/api';
import { BTN_PRIMARY, INP } from '../lib/tokens';
import { useAuth } from './auth';

const nzd = (c) => (c === null || c === undefined ? '—' : `$${(Number(c) / 100).toFixed(2)}`);

export default function BuyBox({ id, priceCents }) {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function buy() {
    setErr('');
    const em = (user?.email || email).trim();
    if (!em) { setErr('Enter your email for delivery.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/checkout`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_id: id, email: em }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      window.location.assign(j.data.checkout_url);
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <div className="mt-4 rounded border border-line bg-card2 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-faint font-bold">Digital download</span>
        <b className="text-gold text-[16px]">{nzd(priceCents)}</b>
      </div>
      {!user?.email && (
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email for delivery"
          type="email" className={`${INP} w-full mt-2 !text-[13px]`} />
      )}
      {err && <p className="text-blood text-[12px] mt-2">{err}</p>}
      <button onClick={buy} disabled={busy || priceCents === null} className={`${BTN_PRIMARY} w-full mt-2`}>
        {busy ? 'Starting checkout…' : priceCents === null ? 'Not priced yet' : 'Buy now'}
      </button>
      <p className="text-[11px] text-faint mt-2">Secure Stripe checkout. Full resolution after payment.</p>
    </div>
  );
}
