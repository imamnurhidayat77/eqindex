'use client';
import { useEffect, useState } from 'react';
import { API } from '../lib/api';
import { INP } from '../lib/tokens';
import { useAuth } from './auth';

const nzd = (c) => `NZ$${(Number(c || 0) / 100).toFixed(2)}`;
// Early-bird (P1b): same server-side rule (see earlyPriceOf in media.js).
const earlyOf = (pack) => {
  if (!pack || pack.early_price_cents === null || pack.early_price_cents === undefined) return null;
  if (pack.early_until && new Date(pack.early_until) <= new Date()) return null;
  return Number(pack.early_price_cents);
};
const keyFor = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 32)
  : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 20)}`);

// 5-pack credit buy button (P1). Fetches the applicable credit pack for one
// event x rider/horse and starts checkout for a 5-credit bundle.
// Defensive: renders nothing until the credit-packs API exists (pre-P1),
// so it can ship inside P0 without breaking the watchlist.
export default function CreditBuyButton({ eventId, horseId, riderId }) {
  const { user } = useAuth();
  const [pack, setPack] = useState(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  const [idem] = useState(() => keyFor);

  useEffect(() => {
    if (!eventId || (!horseId && !riderId)) return;
    const p = new URLSearchParams({ event_id: eventId });
    if (horseId) p.set('horse_id', horseId); else p.set('rider_id', riderId);
    fetch(`${API}/api/credit-packs?${p}`).then((r) => {
      if (!r.ok) throw new Error('unavailable');
      return r.json();
    }).then((j) => {
      const list = Array.isArray(j.data) ? j.data : [];
      setPack(list[0] || null);
    }).catch(() => setPack(null));
  }, [eventId, horseId, riderId]);

  if (!pack) return null;
  const early = earlyOf(pack);

  async function buy() {
    if (busy) return;
    setErr('');
    const em = (user?.email || email).trim();
    if (!em) { setShowEmail(true); setErr('Enter your email for delivery.'); return; }
    setBusy(true);
    try {
      const body = { pack_id: pack.id, event_id: eventId, email: em, idempotency_key: idem() };
      if (horseId) body.horse_id = horseId; else body.rider_id = riderId;
      const res = await fetch(`${API}/api/credit-orders`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      if (!j.data?.checkout_url) throw new Error('Checkout already started — check your email for the payment link.');
      window.location.assign(j.data.checkout_url);
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <div className="mt-2 rounded border border-sky/40 bg-card2 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px]">
          <b>Pick any {pack.slots || 5} photos</b>
          <div className="text-[11px] text-faint">
            {early !== null ? (
              <><s>{nzd(pack.price_cents)}</s> <b className="text-gold">{nzd(early)}</b> early-bird</>
            ) : nzd(pack.price_cents)} · unlock individually, keep forever
          </div>
        </div>
        <button onClick={buy} disabled={busy}
          className="bg-sky text-black font-bold rounded px-3.5 py-2 text-[13px] hover:brightness-110 shrink-0">
          {busy ? '…' : `Get ${pack.slots || 5}`}
        </button>
      </div>
      {(showEmail && !user?.email) && (
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email for delivery"
          type="email" className={`${INP} w-full mt-2 !text-[13px]`} />
      )}
      {err && <p className="text-blood text-[12px] mt-1">{err}</p>}
    </div>
  );
}
