'use client';
import { useEffect, useState } from 'react';
import { API } from '../lib/api';

const keyFor = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 32)
  : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 20)}`);

export default function BuyBox({ id, defaultTier }) {
  const [tiers, setTiers] = useState(null);
  const [picked, setPicked] = useState(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [idem] = useState(() => keyFor);

  useEffect(() => {
    fetch(`${API}/api/license-tiers`).then((r) => r.json()).then((j) => {
      const list = Array.isArray(j.data) ? j.data : [];
      setTiers(list);
      if (list.some((t) => t.id === (defaultTier || 'web'))) setPicked(defaultTier || 'web');
      else if (list.length) setPicked(list[0].id);
    }).catch(() => setTiers([]));
  }, [defaultTier]);

  const tier = (tiers || []).find((t) => t.id === picked);
  const amount = tier && Number.isInteger(tier.price_cents) ? tier.price_cents : null;

  async function buy() {
    if (busy || !Number.isInteger(amount) || amount <= 0) return;
    setErr('');
    if (!email.trim()) { setErr('Enter your email for delivery.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/checkout`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_id: id, email: email.trim(), license_tier: picked, idempotency_key: idem() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      if (!j.data?.checkout_url) throw new Error('Checkout already started — check your email.');
      window.location.assign(j.data.checkout_url);
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  if (!tiers) return <p className="meta">Loading licenses…</p>;
  return (
    <div className="buybox">
      <h3>License</h3>
      <div role="radiogroup" aria-label="License">
        {tiers.map((t) => (
          <button key={t.id} role="radio" aria-checked={picked === t.id} onClick={() => setPicked(t.id)}
            className="tier" data-picked={picked === t.id}>
            <span>{t.label || t.id}
              <small>{[t.max_resolution, t.printable ? 'printable' : null].filter(Boolean).join(' · ') || 'Digital download'}</small>
            </span>
            <b className="price">NZ${(Number(t.price_cents) / 100).toFixed(2)}</b>
          </button>
        ))}
      </div>
      <ul className="meta" style={{ paddingLeft: 18, margin: '12px 0 0' }}>
        <li>Watermark-free full resolution</li>
        <li>Instant download after payment</li>
      </ul>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email for delivery" type="email"
        style={{ width: '100%', marginTop: 12, padding: '10px 12px', borderRadius: 10, border: '1px solid #333338', background: '#0a0a0b', color: '#fff' }} />
      {err && <p className="err">{err}</p>}
      <button onClick={buy} disabled={busy || !amount} className="cta">
        {busy ? 'Starting checkout…' : amount ? `Buy now · NZ$${(amount / 100).toFixed(2)}` : 'Not priced yet'}
      </button>
      <p className="meta" style={{ fontSize: 11 }}>Secure Stripe checkout. Full resolution after payment.</p>
    </div>
  );
}
