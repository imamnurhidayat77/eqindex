'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { API } from '../lib/api';
import { CARD, BTN_PRIMARY, INP } from '../lib/tokens';
import { useAuth } from './auth';
import { Sk } from './Skeletons';

const nzd = (c) => (c === null || c === undefined ? '—' : `NZ$${(Number(c) / 100).toFixed(2)}`);
const SCOPE = { clip: 'Raw clip', round: 'Round edit', event: 'Event edit' };

const keyFor = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 32)
  : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 20)}`);

// Video Reels order form (Sportfot-style information sheet).
// Rider picks a product (admin-priced per event), fills the shoot details for
// ONE horse, and chooses music like Sportfot: choose for me | track title | none.
// Submit creates the order + Stripe checkout (pay up front, then we produce).
export default function ReelOrderForm({ eventId, eventName }) {
  const { user } = useAuth();
  const [products, setProducts] = useState(null);
  const [picked, setPicked] = useState(null);
  const [form, setForm] = useState({
    horse_name: '', shooting_date: '', ring: '', class_name: '',
    back_number: '', phone: '', music_mode: 'choose_for_me', music_title: '',
    showcase: false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [idem] = useState(() => keyFor);

  useEffect(() => {
    const p = new URLSearchParams();
    if (eventId) p.set('event_id', eventId);
    fetch(`${API}/api/reel-products?${p}`).then((r) => r.json()).then((j) => {
      const list = Array.isArray(j.data) ? j.data : [];
      setProducts(list);
      if (list.length && !picked) setPicked(list[0].id);
    }).catch(() => setProducts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const product = (products || []).find((x) => x.id === picked);

  async function order() {
    if (busy || !product) return;
    setErr('');
    if (!form.horse_name.trim()) { setErr('Horse name is required (one horse per order).'); return; }
    if (form.music_mode === 'title' && !form.music_title.trim()) {
      setErr('Name the track, or pick another music option.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/reel-orders`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: product.id, event_id: eventId || undefined,
          horse_name: form.horse_name.trim(),
          shooting_date: form.shooting_date || undefined,
          ring: form.ring.trim() || undefined,
          class_name: form.class_name.trim() || undefined,
          back_number: form.back_number.trim() || undefined,
          phone: form.phone.trim() || undefined,
          email: user?.email || undefined,
          music_mode: form.music_mode,
          music_title: form.music_mode === 'title' ? form.music_title.trim() : undefined,
          showcase: !!form.showcase,
          idempotency_key: idem(),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 401) throw new Error('Log in to order a reel — your order stays linked to your account.');
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      if (j.data?.checkout_url) window.location.href = j.data.checkout_url;
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  if (products !== null && !products.length) {
    return (
      <section className={CARD}>
        <h2 className="text-[15px] font-bold">Video Reels</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">
          No reel packages at{eventName ? ` ${eventName}` : ' this event'} yet — check back soon, or{' '}
          <Link href="/contact" className="text-sky hover:underline">ask us</Link> about custom filming.
        </p>
      </section>
    );
  }

  return (
    <section className={CARD}>
      <h2 className="text-[15px] font-bold">Video Reels</h2>
      <p className="mt-0.5 mb-3 text-[12.5px] text-muted">
        Custom reels filmed and edited for you{eventName ? ` at ${eventName}` : ''} — pay up front, we produce after.
      </p>
      {products === null ? (
        <div aria-hidden="true" aria-label="Loading reel options">
          <div className="grid gap-2 md:grid-cols-3 mb-3">
            {[0, 1, 2].map((i) => <Sk key={i} className="h-[86px] !rounded-lg" />)}
          </div>
          <div className="grid gap-2 md:grid-cols-2 mb-2.5">
            {[0, 1, 2, 3, 4, 5].map((i) => <Sk key={i} className="h-[52px] !rounded-md" />)}
          </div>
          <Sk className="h-24 w-full !rounded-lg mb-3" />
          <Sk className="h-10 w-48 !rounded-md" />
        </div>
      ) : (
        <>
          <div className="grid gap-2 md:grid-cols-3 mb-3">
            {products.map((x) => (
              <button key={x.id} onClick={() => setPicked(x.id)}
                className={`rounded-lg border p-2.5 text-left cursor-pointer transition ${picked === x.id ? 'border-gold bg-goldbg/15' : 'border-line bg-card2 hover:border-gold/50'}`}>
                <div className="text-[13px] font-bold text-white">{x.name}</div>
                <div className="text-[11.5px] text-faint">{SCOPE[x.scope] || x.scope}{x.coverage === 'full' ? ' · full coverage' : ''}{x.includes_raw ? ' · + raw footage' : ''}</div>
                {x.description && <div className="mt-1 text-[11.5px] text-muted">{x.description}</div>}
                <div className="mt-1 text-[13px] font-bold text-gold tabular-nums">{nzd(x.price_cents)}</div>
              </button>
            ))}
          </div>
          <div className="grid gap-2 md:grid-cols-2 mb-2.5">
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Horse (one per order) *
              <input value={form.horse_name} onChange={(e) => set('horse_name', e.target.value)} placeholder="e.g. Donatello" className={INP} /></label>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Shooting date
              <input type="date" value={form.shooting_date} onChange={(e) => set('shooting_date', e.target.value)} className={INP} /></label>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Ring / arena
              <input value={form.ring} onChange={(e) => set('ring', e.target.value)} placeholder="e.g. Ring 1" className={INP} /></label>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Class
              <input value={form.class_name} onChange={(e) => set('class_name', e.target.value)} placeholder="e.g. 1.30m Grand Prix" className={INP} /></label>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Back number
              <input value={form.back_number} onChange={(e) => set('back_number', e.target.value)} placeholder="e.g. 214" className={INP} /></label>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Phone
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="For shoot-day contact" className={INP} /></label>
          </div>
          <fieldset className="mb-3 rounded-lg border border-line p-2.5">
            <legend className="px-1 text-[11px] uppercase tracking-wide text-faint font-bold">Music</legend>
            <div className="grid gap-1.5">
              {[
                ['choose_for_me', 'Choose for me', 'Our editor picks a licensed track that fits.'],
                ['title', 'I have a track in mind', 'Name it below — we’ll use it if licensing allows.'],
                ['none', 'No music', 'Delivered silent so you can add your own sound on upload.'],
              ].map(([v, label, hint]) => (
                <label key={v} className="flex items-start gap-2 text-[13px] cursor-pointer">
                  <input type="radio" name="music" checked={form.music_mode === v} onChange={() => set('music_mode', v)} className="mt-1" />
                  <span><span className="font-bold text-white">{label}</span><br /><span className="text-muted text-[12px]">{hint}</span></span>
                </label>
              ))}
              {form.music_mode === 'title' && (
                <input value={form.music_title} onChange={(e) => set('music_title', e.target.value)} placeholder="Artist — track title" className={INP} />
              )}
            </div>
          </fieldset>
          <label className="mb-3 flex items-start gap-2 text-[13px] cursor-pointer rounded-lg border border-line p-2.5">
            <input type="checkbox" checked={!!form.showcase} onChange={(e) => set('showcase', e.target.checked)} className="mt-1" />
            <span><span className="font-bold text-white">Showcase my reel</span><br />
              <span className="text-muted text-[12px]">Allow the finished teaser in public galleries as portfolio work. Unticked = private to you; the full file is always yours alone.</span></span>
          </label>
          {err && <p className="mb-2 text-[13px] text-blood" role="alert">{err}</p>}
          <button onClick={order} disabled={busy || !product} className={BTN_PRIMARY}>
            {busy ? 'Creating order…' : product ? `Order reel · ${nzd(product.price_cents)}` : 'Order reel'}
          </button>
          {!user && <p className="mt-2 text-[12px] text-faint">You’ll be asked to log in before paying — the reel stays linked to your account.</p>}
        </>
      )}
    </section>
  );
}
