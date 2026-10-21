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
    <div className="mt-3 space-y-2">
      {rows.map((pk) => {
        const early = earlyOf(pk);
        const price = early !== null ? early : pk.price_cents;
        const who = pk.horse_id ? (horse || 'Horse') : pk.rider_id ? (rider || 'Rider') : null;
        return (
          <div key={pk.id} className="flex items-stretch gap-0 overflow-hidden rounded-lg border border-gold/40 bg-card2">
            <div className="flex w-[86px] shrink-0 flex-col items-center justify-center gap-0.5 bg-black/60 px-2 py-3 text-center">
              <span className="text-[13px] font-extrabold tracking-widest text-white">PACKAGE</span>
              <span className="text-[9.5px] font-bold tracking-widest text-gold">BEST DEAL</span>
            </div>
            <div className="flex min-w-0 grow flex-col justify-center gap-0.5 px-3 py-2.5">
              <div className="text-[12px] text-muted">All photos of</div>
              <div className="truncate text-[13.5px] font-extrabold text-white">{who || 'this event'}</div>
              <div className="text-[12px]">
                {Number(pk.reels) > 0
                  ? <span className="text-faint">{Number(pk.items) - Number(pk.reels)} photos · {pk.reels} reel{Number(pk.reels) === 1 ? '' : 's'} · </span>
                  : <span className="text-faint">{pk.items} photos · </span>}
                {early !== null ? (
                  <><s className="text-faint">{nzd(pk.price_cents)}</s> <b className="text-gold">from {nzd(early)}</b></>
                ) : <b className="text-gold">from {nzd(price)}</b>}
                {early !== null && earlyLeft(pk) && <span className="text-gold"> · {earlyLeft(pk)}</span>}
              </div>
            </div>
            <div className="flex items-center pr-2.5">
              <button onClick={() => buy(pk)} disabled={!!busyId}
                className="rounded bg-gold px-4 py-2 text-[13px] font-extrabold text-black hover:brightness-110 shrink-0 disabled:opacity-60">
                {busyId === pk.id ? '…' : 'PACKAGES'}
              </button>
            </div>
          </div>
        );
      })}
      {!user?.email && (
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email for delivery"
          type="email" className={`${INP} w-full mt-1 !text-[13px]`} />
      )}
      {err && <p className="text-blood text-[12px] mt-1">{err}</p>}
    </div>
  );
}

// Whole-event bundle: every photo of one event in a single checkout
// (packages row with no horse/rider). Same checkout + early-bird rules as
// the subject packages above, rendered with its own FULL EVENT badge.
export function EventPackageUpsell({ eventId, eventName }) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [idem] = useState(() => keyFor());
  useEffect(() => {
    if (!eventId) return;
    fetch(`${API}/photos/packages?event_id=${eventId}`).then((r) => r.json()).then((j) => setRows(j.data || [])).catch(() => {});
  }, [eventId]);
  if (!rows.length) return null;

  async function buy(pk) {
    if (busyId) return;
    setErr('');
    const em = (user?.email || email).trim();
    if (!em) { setErr('Enter your email for delivery.'); return; }
    setBusyId(pk.id);
    try {
      // Virtual rows (no package row yet) materialize server-side at checkout.
      const body = pk.virtual
        ? { whole_event: true, event_id: eventId, email: em, idempotency_key: idem() }
        : { package_id: pk.id, email: em, idempotency_key: idem() };
      const res = await fetch(`${API}/api/checkout`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      if (!j.data?.checkout_url) throw new Error('Checkout already started — check your email for the payment link.');
      window.location.assign(j.data.checkout_url);
    } catch (e) { setErr(e.message); setBusyId(null); }
  }

  return (
    <div className="mt-3 space-y-2">
      {rows.map((pk) => {
        const early = earlyOf(pk);
        const price = early !== null ? early : pk.price_cents;
        return (
          <div key={pk.id} className="flex items-stretch gap-0 overflow-hidden rounded-lg border border-gold/60 bg-gradient-to-r from-goldbg/40 to-card2">
            <div className="flex w-[86px] shrink-0 flex-col items-center justify-center gap-0.5 bg-black/60 px-2 py-3 text-center">
              <span className="text-[13px] font-extrabold tracking-widest text-white">FULL</span>
              <span className="text-[13px] font-extrabold tracking-widest text-white">EVENT</span>
              <span className="text-[9.5px] font-bold tracking-widest text-gold">ALL PHOTOS</span>
            </div>
            <div className="flex min-w-0 grow flex-col justify-center gap-0.5 px-3 py-2.5">
              <div className="text-[12px] text-muted">Every photo of</div>
              <div className="truncate text-[13.5px] font-extrabold text-white">{eventName || 'this event'}</div>
              <div className="text-[12px]">
                {Number(pk.reels) > 0
                  ? <span className="text-faint">{Number(pk.items) - Number(pk.reels)} photos · {pk.reels} reel{Number(pk.reels) === 1 ? '' : 's'} · </span>
                  : <span className="text-faint">{pk.items} photos · </span>}
                {early !== null ? (
                  <><s className="text-faint">{nzd(pk.price_cents)}</s> <b className="text-gold">from {nzd(early)}</b></>
                ) : <b className="text-gold">from {nzd(price)}</b>}
                {early !== null && earlyLeft(pk) && <span className="text-gold"> · {earlyLeft(pk)}</span>}
              </div>
            </div>
            <div className="flex items-center pr-2.5">
              <button onClick={() => buy(pk)} disabled={!!busyId}
                className="rounded bg-gold px-4 py-2 text-[13px] font-extrabold text-black hover:brightness-110 shrink-0 disabled:opacity-60">
                {busyId === pk.id ? '…' : 'GET ALL'}
              </button>
            </div>
          </div>
        );
      })}
      {!user?.email && (
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email for delivery"
          type="email" className={`${INP} w-full mt-1 !text-[13px]`} />
      )}
      {err && <p className="text-blood text-[12px] mt-1">{err}</p>}
    </div>
  );
}
