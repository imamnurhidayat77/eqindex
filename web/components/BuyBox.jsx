'use client';
import { useEffect, useState } from 'react';
import { API } from '../lib/api';
import { BTN_PRIMARY, INP } from '../lib/tokens';
import { useAuth } from './auth';

const nzd = (c) => (c === null || c === undefined ? '—' : `NZ$${(Number(c) / 100).toFixed(2)}`);

const keyFor = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 32)
  : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 20)}`);

// Buy box with license-tier picker (Sportfot-style categories).
// Effective price mirrors POST /api/checkout exactly:
//   chosen tier price, except when the tier is the photo's default AND the
//   photo has its own price — then the lower of the two wins.
// If the logged-in buyer already owns the photo (direct or via package),
// the box collapses to an Owned state with a download link — no second sale.
export default function BuyBox({ id, priceCents, tier, tierLabel }) {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [tiers, setTiers] = useState(null);
  const [picked, setPicked] = useState(null);
  const [idem] = useState(() => keyFor);
  const [owned, setOwned] = useState(null);

  const defaultTier = tier || 'web';
  useEffect(() => {
    fetch(`${API}/api/license-tiers`).then((r) => r.json()).then((j) => {
      const list = Array.isArray(j.data) ? j.data : [];
      setTiers(list);
      if (!picked && list.some((t) => t.id === defaultTier)) setPicked(defaultTier);
      else if (!picked && list.length) setPicked(list[0].id);
    }).catch(() => setTiers([]));
    // Ownership check (session cookie, first-party via /api proxy).
    // GET /photos/:id returns {owned, owned_tier} for the logged-in buyer.
    fetch(`${API}/photos/${id}`, { credentials: 'include' }).then((r) => r.json()).then((j) => {
      if (j?.data?.owned) setOwned(j.data);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const pickedTier = (tiers || []).find((t) => t.id === picked);
  let amount = null;
  if (pickedTier && Number.isInteger(pickedTier.price_cents) && pickedTier.price_cents > 0) {
    amount = pickedTier.price_cents;
    if (priceCents !== null && priceCents !== undefined && picked === defaultTier) {
      amount = Math.min(amount, Number(priceCents));
    }
  } else if (picked === defaultTier && priceCents !== null && priceCents !== undefined) {
    amount = Number(priceCents);
  }

  async function buy() {
    if (busy || !Number.isInteger(amount) || amount <= 0) return;
    setErr('');
    const em = (user?.email || email).trim();
    if (!em) { setErr('Enter your email for delivery.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/checkout`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_id: id, email: em, license_tier: picked, idempotency_key: idem() }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 409 && j.owned) {
        // Race: bought in another tab between page load and click.
        setOwned({ owned: true, owned_tier: j.license_tier });
        throw new Error(j.error || 'You already own this photo.');
      }
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      if (!j.data?.checkout_url) throw new Error('Checkout already started — check your email for the payment link.');
      window.location.assign(j.data.checkout_url);
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  if (owned?.owned) {
    return (
      <div className="mt-4 rounded border border-gold/50 bg-goldbg/20 p-3">
        <div className="text-[13px] font-bold text-gold">✓ You own this photo{owned.owned_tier ? ` · ${owned.owned_tier}` : ''}</div>
        <p className="text-[12px] text-muted mt-1">Full resolution unlocked — re-download any time.</p>
        <a href={`${API}/api/media/${id}/download`} className={`${BTN_PRIMARY} no-underline text-center block w-full mt-2`}>
          Download full-res
        </a>
        <a href="/photos/library" className="block text-center text-sky text-[12px] no-underline hover:underline mt-2">My photos →</a>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded border border-line bg-card2 p-3">
      <div className="text-[11px] uppercase tracking-wide text-faint font-bold mb-2">License</div>
      {!tiers ? (
        <p className="text-[12px] text-faint">Loading licenses…</p>
      ) : !tiers.length ? (
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wide text-faint font-bold">Digital download{tierLabel ? ` · ${tierLabel}` : ''}</span>
          <b className="text-gold text-[16px]">{nzd(priceCents)}</b>
        </div>
      ) : (
        <div className="flex flex-col gap-1" role="radiogroup" aria-label="License">
          {tiers.map((t) => (
            <button key={t.id} role="radio" aria-checked={picked === t.id} onClick={() => setPicked(t.id)}
              className={`flex items-baseline justify-between gap-2 rounded-lg border px-2.5 py-2 text-left cursor-pointer transition ${picked === t.id ? 'border-gold/70 bg-goldbg/30' : 'border-line hover:border-gold/40'}`}>
              <span className={`text-[13px] ${picked === t.id ? 'text-white font-bold' : 'text-muted'}`}>{t.label || t.id}</span>
              <span className={`text-[13px] font-bold tabular-nums ${picked === t.id ? 'text-gold' : 'text-faint'}`}>{nzd(t.price_cents)}</span>
            </button>
          ))}
        </div>
      )}
      {!user?.email && (
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email for delivery"
          type="email" className={`${INP} w-full mt-2 !text-[13px]`} />
      )}
      {err && <p className="text-blood text-[12px] mt-2">{err}</p>}
      <div className="flex items-baseline justify-between gap-2 mt-2.5">
        <span className="text-[11px] uppercase tracking-wide text-faint font-bold">Total</span>
        <b className="text-gold text-[16px]">{nzd(amount)}</b>
      </div>
      <button onClick={buy} disabled={busy || !Number.isInteger(amount) || amount <= 0} className={`${BTN_PRIMARY} w-full mt-2`}>
        {busy ? 'Starting checkout…' : amount ? `Buy now · ${nzd(amount)}` : 'Not priced yet'}
      </button>
      <p className="text-[11px] text-faint mt-2">Secure Stripe checkout. Full resolution after payment.</p>
    </div>
  );
}
