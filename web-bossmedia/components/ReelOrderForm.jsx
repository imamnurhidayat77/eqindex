'use client';
import { useEffect, useState } from 'react';
import { API } from '../lib/api';

const SCOPE = { clip: 'Raw clip', round: 'Round edit', event: 'Event edit' };

export default function ReelOrderForm({ eventId, eventName }) {
  const [products, setProducts] = useState(null);
  const [picked, setPicked] = useState(null);
  const [form, setForm] = useState({
    horse_name: '', shooting_date: '', ring: '', class_name: '',
    back_number: '', phone: '', music_mode: 'choose_for_me', music_title: '',
    showcase: false, email: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const p = new URLSearchParams();
    if (eventId) p.set('event_id', eventId);
    fetch(`${API}/api/reel-products?${p}`).then((r) => r.json()).then((j) => {
      const list = Array.isArray(j.data) ? j.data : [];
      setProducts(list);
      if (list.length) setPicked(list[0].id);
    }).catch(() => setProducts([]));
  }, [eventId]);

  const product = (products || []).find((x) => x.id === picked);
  const nzd = (c) => `NZ$${(Number(c || 0) / 100).toFixed(2)}`;

  async function order() {
    if (busy || !product) return;
    setErr('');
    if (!form.horse_name.trim()) { setErr('Horse name is required (one horse per order).'); return; }
    if (!form.email.trim()) { setErr('Enter your email for delivery and receipt.'); return; }
    if (form.music_mode === 'title' && !form.music_title.trim()) { setErr('Name the track, or pick another music option.'); return; }
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
          email: form.email.trim(),
          music_mode: form.music_mode,
          music_title: form.music_mode === 'title' ? form.music_title.trim() : undefined,
          showcase: !!form.showcase,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 401) throw new Error('Log in to order a reel — your order stays linked to your account.');
      if (!res.ok) throw new Error(j.error || 'Order failed');
      if (!j.data?.checkout_url) throw new Error('Checkout already started — check your email.');
      window.location.assign(j.data.checkout_url);
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  if (products !== null && !products.length) {
    return (
      <div className="card" style={{ padding: 28 }}>
        <h3 className="card-title">No reel products here yet</h3>
        <p className="caption">Reels open for booking once the event is confirmed. Check back soon.</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 22 }}>
      <h3 className="card-title">Video Reels</h3>
      <p className="caption" style={{ margin: '4px 0 14px' }}>
        Custom reels filmed and edited for you{eventName ? ` at ${eventName}` : ''} — pay up front, we produce after.
      </p>
      {products === null ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {[0, 1, 2].map((i) => <span key={i} className="sk" style={{ height: 86, borderRadius: 12 }} />)}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: 16 }}>
            {products.map((x) => (
              <button key={x.id} onClick={() => setPicked(x.id)} aria-pressed={picked === x.id}
                style={{ textAlign: 'left', borderRadius: 12, padding: 14, cursor: 'pointer',
                  border: picked === x.id ? '2px solid #1F3D2E' : '1px solid #E7E2D8', background: '#fff' }}>
                <div style={{ fontWeight: 800 }}>{x.name}</div>
                <div className="caption">{SCOPE[x.scope] || x.scope}{x.coverage === 'full' ? ' · full coverage' : ''}{x.includes_raw ? ' · + raw footage' : ''}</div>
                {x.description && <div className="caption" style={{ marginTop: 4 }}>{x.description}</div>}
                <div className="price" style={{ marginTop: 6 }}>{nzd(x.price_cents)}</div>
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 4 }}>
            {[
              ['horse_name', 'Horse (one per order) *', 'text', 'e.g. Donatello'],
              ['shooting_date', 'Shooting date', 'date', ''],
              ['ring', 'Ring / arena', 'text', 'e.g. Ring 1'],
              ['class_name', 'Class', 'text', 'e.g. 1.30m Grand Prix'],
              ['back_number', 'Back number', 'text', 'e.g. 214'],
              ['phone', 'Phone', 'text', 'For shoot-day contact'],
              ['email', 'Email *', 'email', 'Receipt + delivery link'],
            ].map(([k, label, t, ph]) => (
              <div className="field" key={k} style={{ marginBottom: 0 }}>
                <label htmlFor={`ro-${k}`}>{label}</label>
                <input id={`ro-${k}`} type={t} value={form[k]} placeholder={ph} onChange={(e) => set(k, e.target.value)} />
              </div>
            ))}
          </div>
          <fieldset style={{ border: '1px solid #E7E2D8', borderRadius: 12, padding: 14, margin: '14px 0' }}>
            <legend style={{ padding: '0 6px', fontSize: 12, fontWeight: 700 }}>MUSIC</legend>
            {[
              ['choose_for_me', 'Choose for me', 'Our editor picks a licensed track that fits.'],
              ['title', 'I have a track in mind', 'Name it below — we use it if licensing allows.'],
              ['none', 'No music', 'Delivered silent so you can add your own sound on upload.'],
            ].map(([v, label, hint]) => (
              <label key={v} style={{ display: 'flex', gap: 10, marginBottom: 10, cursor: 'pointer' }}>
                <input type="radio" name="music" checked={form.music_mode === v} onChange={() => set('music_mode', v)} style={{ marginTop: 4 }} />
                <span><b>{label}</b><br /><span className="caption">{hint}</span></span>
              </label>
            ))}
            {form.music_mode === 'title' && (
              <input value={form.music_title} onChange={(e) => set('music_title', e.target.value)} placeholder="Artist — track title"
                style={{ width: '100%', padding: '11px 12px', fontSize: 16, borderRadius: 8, border: '1px solid #E7E2D8' }} />
            )}
          </fieldset>
          <label style={{ display: 'flex', gap: 10, marginBottom: 16, cursor: 'pointer', border: '1px solid #E7E2D8', borderRadius: 12, padding: 14 }}>
            <input type="checkbox" checked={form.showcase} onChange={(e) => set('showcase', e.target.checked)} style={{ marginTop: 4 }} />
            <span><b>Showcase my reel</b><br />
              <span className="caption">Allow the finished teaser in public galleries as portfolio work. Unticked = private to you; the full file is always yours alone.</span></span>
          </label>
          {err && <p className="err">{err}</p>}
          <button onClick={order} disabled={busy || !product} className="btn btn-primary btn-lg">
            {busy ? 'Creating order…' : product ? `Order reel · ${nzd(product.price_cents)}` : 'Order reel'}
          </button>
          <p className="caption" style={{ marginTop: 8 }}>You will be asked to log in before paying — the reel stays linked to your account.</p>
        </>
      )}
    </div>
  );
}
