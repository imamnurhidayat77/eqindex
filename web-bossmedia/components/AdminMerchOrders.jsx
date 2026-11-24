'use client';
// Admin > Merch orders: newest orders, the buyer's design and artwork, and
// the art proof step. Sending a proof moves the order to proof_sent and
// emails the buyer, who approves it or asks for changes on their order page.
import { useCallback, useEffect, useState } from 'react';
import { useNotify } from './Toaster';
import SmartImage from './SmartImage';
import { nzdc, studio, studioFetch } from '../lib/studio';
import { merchPositions } from '../lib/merch.mjs';
import { API } from '../lib/api';
import s from './AdminMerchOrders.module.css';

const STATUSES = ['submitted', 'artwork_review', 'changes_requested', 'proof_sent', 'approved',
  'paid', 'in_production', 'shipped', 'delivered', 'cancelled', 'refunded'];
const PROOF_FROM = ['submitted', 'artwork_review', 'changes_requested', 'proof_sent'];
const PROOF_MAX_BYTES = 15 * 1024 * 1024;
const statusName = (st) => st.charAt(0).toUpperCase() + st.slice(1).replace(/_/g, ' ');
const day = (d) => new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
const logoName = (v) => (String(v).startsWith('club:') ? 'Club logo' : String(v).startsWith('mlogo:') ? 'Buyer upload'
  : String(v).startsWith('my:') ? 'Buyer saved logo' : 'Sponsor logo');

export default function AdminMerchOrders() {
  const notify = useNotify();
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);
  const load = useCallback(() => {
    studio.get(`/admin/merch/orders${status ? `?status=${status}` : ''}`).then((r) => setRows(r || [])).catch((e) => notify(e.message, true));
  }, [status, notify]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="st-filters" style={{ marginBottom: 12 }}>
        <label className={s.filter}><span>Status</span>
          <select value={status} onChange={(e) => { setOpen(null); setStatus(e.target.value); }}>
            <option value="">All orders</option>
            {STATUSES.map((st) => <option key={st} value={st}>{statusName(st)}</option>)}
          </select>
        </label>
      </div>
      {rows === null && <p className="empty-note">Loading…</p>}
      {rows?.length === 0 && <p className="empty-note">No orders{status ? ` with status ${statusName(status).toLowerCase()}` : ''}.</p>}
      {rows?.length > 0 && (
        <div className="st-card" style={{ padding: '6px 22px' }}>
          <div className="table-scroll"><table className="st-table">
            <thead><tr><th>Order</th><th>Buyer</th><th>Product</th><th>Items</th><th>Total</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ref}>
                  <td><strong>{r.ref}</strong><br /><small className={s.muted}>{day(r.created_at)}</small></td>
                  <td>{r.buyer_name}<br /><small className={s.muted}>{r.buyer_email}{r.club_name ? ` · ${r.club_name}` : ''}</small></td>
                  <td>{r.product_label || r.product_id}</td>
                  <td>{r.units}</td>
                  <td>{nzdc(r.total_cents)}</td>
                  <td><span className={s.status} data-status={r.status}>{statusName(r.status)}</span></td>
                  <td>
                    <button className="st-btn-ghost" style={{ minHeight: 36 }} aria-expanded={open === r.ref}
                      onClick={() => setOpen(open === r.ref ? null : r.ref)}>{open === r.ref ? 'Close' : 'Open'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
      {open && <OrderDetail key={open} orderRef={open} onChanged={load} />}
    </>
  );
}

function OrderDetail({ orderRef, onChanged }) {
  const notify = useNotify();
  const [o, setO] = useState(null);
  const load = useCallback(() => {
    studio.get(`/api/merch/orders/${orderRef}`).then(setO).catch((e) => notify(e.message, true));
  }, [orderRef, notify]);
  useEffect(() => { load(); }, [load]);

  if (!o) return <p className="empty-note">Loading {orderRef}…</p>;
  const slots = merchPositions(o.productId).filter((p) => o.design?.slots?.[p.id]);
  return (
    <div className="st-card" style={{ padding: 18, marginTop: 16 }}>
      <h3 className={s.h3}>{o.ref} · {o.quote?.product?.label || o.productId} · {o.quote?.product?.colorName || o.color}</h3>
      <div className={s.grid}>
        <dl className={s.facts}>
          <div><dt>Status</dt><dd>{statusName(o.status)}</dd></div>
          <div><dt>Sizes</dt><dd>{o.lines.map((l) => `${l.size} × ${l.qty}`).join(', ')}</dd></div>
          {slots.map((p) => <div key={p.id}><dt>{p.label}</dt><dd>{logoName(o.design.slots[p.id])}</dd></div>)}
          <div><dt>Buyer</dt><dd>{o.contact.name} · <a href={`mailto:${o.contact.email}`}>{o.contact.email}</a>{o.contact.phone ? ` · ${o.contact.phone}` : ''}</dd></div>
          <div><dt>Delivery</dt><dd>{o.delivery === 'pickup' ? `Club pickup, ${o.contact.club}` : [o.address?.line1, o.address?.line2, o.address?.city, o.address?.postcode].filter(Boolean).join(', ')}</dd></div>
          {o.notes && <div><dt>Buyer notes</dt><dd>{o.notes}</dd></div>}
          <div><dt>Total</dt><dd>{nzdc(o.totalCents)}</dd></div>
          {o.artwork?.length > 0 && (
            <div><dt>Artwork</dt><dd className={s.links}>
              {o.artwork.map((a, i) => a.url
                ? <a key={a.id} href={a.url} target="_blank" rel="noreferrer">Upload {i + 1} ({a.width}×{a.height}px)</a>
                : <span key={a.id}>Upload {i + 1} unavailable</span>)}
            </dd></div>
          )}
        </dl>
        <ol className={s.timeline} aria-label="Order history">
          {o.events.map((e) => (
            <li key={e.id}>
              <strong>{statusName(e.status)}</strong> <small className={s.muted}>{day(e.at)}</small>
              {e.note && <p className={s.note}>{e.note}</p>}
              {e.proofPath && (
                <a href={`${API}${e.proofPath}`} target="_blank" rel="noreferrer" className={s.thumbLink}>
                  <SmartImage src={`${API}${e.proofPath}`} alt={`Proof sent ${day(e.at)}`} className={s.thumb} width={160} height={120} unoptimized />
                </a>
              )}
            </li>
          ))}
        </ol>
      </div>
      {PROOF_FROM.includes(o.status)
        ? <SendProof orderRef={o.ref} resend={o.status === 'proof_sent'} onSent={() => { load(); onChanged(); }} />
        : <p className="st-csub" style={{ marginTop: 12 }}>No proof can be sent at this stage ({statusName(o.status).toLowerCase()}).</p>}
    </div>
  );
}

function SendProof({ orderRef, resend, onSent }) {
  const notify = useNotify();
  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(e) {
    e.preventDefault();
    if (!file) return notify('Choose the proof image first.', true);
    if (file.size > PROOF_MAX_BYTES) return notify('The proof must be 15 MB or smaller.', true);
    const form = new FormData();
    form.append('proof', file);
    form.append('note', note);
    setBusy(true);
    try {
      const j = await studioFetch(`/admin/merch/orders/${orderRef}/proof`, { method: 'POST', form });
      notify(j.data?.mailed ? 'Proof sent, the buyer has been emailed' : 'Proof saved, but the email failed. Send the buyer their order link.', !j.data?.mailed);
      setFile(null);
      setNote('');
      onSent();
    } catch (err) { notify(err.message, true); }
    setBusy(false);
  }

  return (
    <form className={s.send} onSubmit={send}>
      <h4 className={s.h4}>{resend ? 'Send a new proof (replaces the waiting one)' : 'Send the art proof'}</h4>
      <label className={s.field}><span>Proof image (PNG, JPEG or WebP, up to 15 MB)</span>
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </label>
      <label className={s.field}><span>Note to the buyer (optional)</span>
        <textarea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. We moved the club logo up 2 cm so it clears the zip" />
      </label>
      <div><button className="st-btn" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send proof to buyer'}</button></div>
    </form>
  );
}
