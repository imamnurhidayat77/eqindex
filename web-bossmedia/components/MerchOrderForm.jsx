'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { API } from '../lib/api';
import { currentMerchSettings, isUploadSlot, merchOrderSettings, quoteMerchOrder } from '../lib/merch.mjs';
import { MERCH_ORDER_RULES } from '../lib/merch-config.mjs';
import s from './MerchOrderForm.module.css';

export const ORDER_FORM_ID = 'merch-order-form';
// Order links for guests: the token in the link is the only key to the
// order, so the browser keeps them for the My orders page.
export const ORDERS_KEY = 'bossmedia:merch-orders';
// Contact and delivery details survive Back/Next and the next order.
const CONTACT_KEY = 'bossmedia:merch-contact';
// Courier is the only delivery option (club pickup was dropped).
const DELIVERY = 'courier';
const nzd = (c) => `NZ$${(Number(c || 0) / 100).toFixed(2)}`;

export function rememberOrder(ref, token) {
  try {
    const list = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]').filter((o) => o?.ref !== ref);
    list.unshift({ ref, token, at: Date.now() });
    localStorage.setItem(ORDERS_KEY, JSON.stringify(list.slice(0, 30)));
  } catch { /* private mode: the email still has the link */ }
}

async function readError(r, fallback) {
  const j = await r.json().catch(() => null);
  return j?.error ? `${j.error[0].toUpperCase()}${j.error.slice(1)}.` : fallback;
}

// Order request for the current design. Nothing is charged here: the
// team checks the artwork, sends a proof, and payment opens after the
// buyer approves it. The server re-quotes every price.
export default function MerchOrderForm({
  product, color, size, slots, slotZoom, slotShift, notes, uploads, quoteCtx, clubName, onState,
}) {
  const [settings, setSettings] = useState(() => currentMerchSettings());
  const [lines, setLines] = useState([{ key: 'l0', size, qty: 1 }]);
  const [contact, setContact] = useState({ name: '', email: '', phone: '', club: clubName || '' });
  const [address, setAddress] = useState({ line1: '', line2: '', city: '', postcode: '' });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [needLogin, setNeedLogin] = useState(false);
  const pathname = usePathname();
  const [done, setDone] = useState(null);
  // Uploaded logo claims by upload key, so a retry never uploads twice.
  const claims = useRef({});
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(CONTACT_KEY) || 'null');
      if (d?.contact) setContact((v) => ({ ...v, ...d.contact, club: d.contact.club || v.club }));
      if (d?.address) setAddress((v) => ({ ...v, ...d.address }));
    } catch { /* ignore */ }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(CONTACT_KEY, JSON.stringify({ contact, address })); } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [restored, contact, address]);

  useEffect(() => {
    let live = true;
    fetch(`${API}/api/merch/settings`).then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j?.data) setSettings(merchOrderSettings(j.data)); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const quote = useMemo(
    () => quoteMerchOrder(product.id, slots, lines, quoteCtx, DELIVERY, settings),
    [product.id, slots, lines, quoteCtx, settings],
  );
  useEffect(() => { onState?.({ busy: !!busy, done: !!done, totalCents: quote?.totalCents ?? null }); }, [busy, done, quote, onState]);

  const usedSizes = new Set(lines.map((l) => l.size));
  const setLine = (key, patch) => setLines((v) => v.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => {
    // Next free size after the last row (wrapping), e.g. M then L.
    const from = product.sizes.indexOf(lines[lines.length - 1]?.size) + 1;
    const free = [...product.sizes.slice(from), ...product.sizes.slice(0, from)].find((z) => !usedSizes.has(z));
    if (free) setLines((v) => [...v, { key: `l${Date.now().toString(36)}`, size: free, qty: 1 }]);
  };
  const field = (setter) => (k) => (e) => setter((v) => ({ ...v, [k]: e.target.value }));
  const onContact = field(setContact);
  const onAddress = field(setAddress);

  const submit = async (e) => {
    e.preventDefault();
    if (busy || done) return;
    setError('');
    setNeedLogin(false);
    try {
      // Swap session-only upload URLs for server logo ids.
      const sent = { ...slots };
      const used = [];
      for (const [pos, v] of Object.entries(slots)) {
        if (!isUploadSlot(v) || !String(v).startsWith('upload:')) continue;
        const u = uploads.find((x) => `upload:${x.url}` === v);
        if (!u?.file) throw new Error('An uploaded logo was lost on reload. Upload it again in Branding.');
        if (!claims.current[u.key]) {
          setBusy('Uploading your logo…');
          const fd = new FormData();
          fd.append('logo', u.file);
          const r = await fetch(`${API}/api/merch/logos`, { method: 'POST', body: fd, credentials: 'include' });
          if (!r.ok) throw new Error(await readError(r, 'Logo upload failed. Try again.'));
          claims.current[u.key] = (await r.json()).data;
        }
        const c = claims.current[u.key];
        sent[pos] = `mlogo:${c.id}`;
        if (!used.some((x) => x.id === c.id)) used.push({ id: c.id, secret: c.secret });
      }
      setBusy('Sending your order…');
      const body = {
        productId: product.id, color, slots: sent, slotZoom, slotShift, notes,
        lines: lines.map(({ size: z, qty }) => ({ size: z, qty: Number(qty) })),
        contact, delivery: DELIVERY, address, uploads: used,
      };
      const r = await fetch(`${API}/api/merch/orders`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (r.status === 401) setNeedLogin(true);
      if (!r.ok) throw new Error(await readError(r, 'Could not send the order. Try again.'));
      const d = (await r.json()).data;
      rememberOrder(d.ref, d.token);
      setDone(d);
    } catch (err) {
      setError(err.message || 'Could not send the order. Try again.');
    } finally {
      setBusy('');
    }
  };

  if (done) {
    return (
      <div className={s.done} role="status">
        <strong>Order {done.ref} received.</strong>
        <p>We check your artwork and email a proof to {contact.email}. Nothing is charged until you approve the proof.</p>
        <p className={s.total}>Quoted total {nzd(done.quote?.totalCents)} incl. GST</p>
        <Link className={s.link} href={`/merch/orders/${done.ref}?t=${encodeURIComponent(done.token)}`}>Track this order →</Link>
      </div>
    );
  }

  const free = settings.freeOverCents > 0;
  return (
    <form id={ORDER_FORM_ID} className={s.form} onSubmit={submit}>
      <fieldset className={s.group} disabled={!!busy}>
        <legend>Sizes and quantities</legend>
        {lines.map((l) => (
          <div className={s.lineRow} key={l.key}>
            <select className={s.input} value={l.size} aria-label="Size"
              onChange={(e) => setLine(l.key, { size: e.target.value })}>
              {product.sizes.map((z) => (
                <option key={z} value={z} disabled={z !== l.size && usedSizes.has(z)}>{z}</option>
              ))}
            </select>
            <input className={s.input} type="number" inputMode="numeric" min={1} max={MERCH_ORDER_RULES.maxUnitsPerLine}
              step={1} required value={l.qty} aria-label={`Quantity for ${l.size}`}
              onChange={(e) => setLine(l.key, { qty: e.target.value === '' ? '' : Math.max(0, Math.floor(Number(e.target.value))) })} />
            <button type="button" className={s.remove} disabled={lines.length === 1}
              onClick={() => setLines((v) => v.filter((x) => x.key !== l.key))} aria-label={`Remove size ${l.size}`}>×</button>
          </div>
        ))}
        {lines.length < Math.min(product.sizes.length, MERCH_ORDER_RULES.maxLines) && (
          <button type="button" className={s.add} onClick={addLine}>+ Add another size</button>
        )}
      </fieldset>

      <fieldset className={s.group} disabled={!!busy}>
        <legend>Contact</legend>
        <div className={s.grid}>
          <label className={s.label}><span>Name</span><input className={s.input} required minLength={2} maxLength={100} autoComplete="name" value={contact.name} onChange={onContact('name')} /></label>
          <label className={s.label}><span>Email</span><input className={s.input} type="email" required maxLength={254} autoComplete="email" value={contact.email} onChange={onContact('email')} /></label>
          <label className={s.label}><span>Phone <small>optional</small></span><input className={s.input} type="tel" maxLength={30} autoComplete="tel" value={contact.phone} onChange={onContact('phone')} /></label>
          <label className={s.label}><span>Club or team <small>optional</small></span><input className={s.input} maxLength={100} value={contact.club} onChange={onContact('club')} /></label>
        </div>
      </fieldset>

      <fieldset className={s.group} disabled={!!busy}>
        <legend>Delivery <small>New Zealand only</small></legend>
        <p className={s.note}>Courier, {nzd(settings.courierCents)} flat{free ? `, free over ${nzd(settings.freeOverCents)}` : ''}.</p>
        <div className={s.grid}>
          <label className={`${s.label} ${s.wide}`}><span>Street address</span><input className={s.input} required minLength={3} maxLength={120} autoComplete="address-line1" value={address.line1} onChange={onAddress('line1')} /></label>
          <label className={`${s.label} ${s.wide}`}><span>Suburb, unit or RD <small>optional</small></span><input className={s.input} maxLength={120} autoComplete="address-line2" value={address.line2} onChange={onAddress('line2')} /></label>
          <label className={s.label}><span>Town or city</span><input className={s.input} required minLength={2} maxLength={60} autoComplete="address-level2" value={address.city} onChange={onAddress('city')} /></label>
          <label className={s.label}><span>Postcode</span><input className={s.input} required inputMode="numeric" pattern="\d{4}" maxLength={4} autoComplete="postal-code" value={address.postcode} onChange={onAddress('postcode')} /></label>
        </div>
      </fieldset>

      <div className={s.summary} aria-live="polite">
        {quote ? (<>
          <div className={s.row}><span>{quote.units} × {nzd(quote.item.baseCents + quote.item.premiumCents)}</span><span>{nzd((quote.item.baseCents + quote.item.premiumCents) * quote.units)}</span></div>
          {quote.discountCents > 0 && (
            <div className={s.row}><span>Sponsor discount{quote.discountCapped ? ` (capped at ${nzd(settings.sponsorCapCents)} per order)` : ''}</span><span className={s.gold}>−{nzd(quote.discountCents)}</span></div>
          )}
          <div className={s.row}><span>Courier</span><span>{quote.shippingCents ? nzd(quote.shippingCents) : 'Free'}</span></div>
          <div className={`${s.row} ${s.total}`}><span>Order total</span><span>{nzd(quote.totalCents)}</span></div>
          <p className={s.note}>Includes {nzd(quote.gstCents)} GST. Estimate only, the server confirms the price. You pay after approving the artwork proof.</p>
        </>) : <p className={s.note}>Add a quantity to see the order total.</p>}
      </div>

      {error && (
        <p className={s.error} role="alert">
          {error}{needLogin && <> <Link className={s.link} href={`/login?next=${encodeURIComponent(pathname || '/merch')}`}>Log in or create an account</Link></>}
        </p>
      )}
      <p className={s.note}>By sending you agree to our <Link href="/terms">terms</Link>.</p>
    </form>
  );
}
