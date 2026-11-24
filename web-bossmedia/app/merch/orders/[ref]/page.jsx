'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { SiteFooter, SiteHeader } from '../../../../components/figma';
import SmartImage from '../../../../components/SmartImage';
import { API } from '../../../../lib/api';
import { merchPositions, merchProduct } from '../../../../lib/merch.mjs';
import { ORDER_STEPS, orderStatusLabel, orderStepIndex } from '../../../../lib/merch-order-status.mjs';
import { useDocumentTitle } from '../../../../lib/use-document-title';
import s from '../orders.module.css';

const nzd = (c) => `NZ$${(Number(c || 0) / 100).toFixed(2)}`;
const day = (d) => new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
const linkToken = () => new URLSearchParams(window.location.search).get('t') || '';
const logoName = (v) => (String(v).startsWith('club:') ? 'Club logo' : String(v).startsWith('mlogo:') ? 'Your logo' : 'Sponsor logo');

// One merch order, opened from the emailed link (?t=token) or by a
// logged-in owner. The buyer answers the artwork proof here; payment comes later.
export default function MerchOrderPage() {
  const ref = String(useParams()?.ref || '').toUpperCase();
  useDocumentTitle(`Order ${ref}`);
  const [state, setState] = useState({ loading: true, order: null });
  const load = useCallback(() => {
    const t = linkToken();
    return fetch(`${API}/api/merch/orders/${encodeURIComponent(ref)}${t ? `?t=${encodeURIComponent(t)}` : ''}`, { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.data || null)
      .catch(() => null);
  }, [ref]);
  useEffect(() => {
    let live = true;
    load().then((order) => { if (live) setState({ loading: false, order }); });
    return () => { live = false; };
  }, [load]);
  const reload = () => load().then((order) => setState({ loading: false, order }));

  const o = state.order;
  const product = o ? merchProduct(o.productId) : null;
  const step = o ? orderStepIndex(o.status) : -1;
  const q = o?.quote || {};
  return (
    <div className="gallery-page">
      <SiteHeader />
      <main>
        <section className={`events-section gallery-browser section-gutter ${s.page}`} data-page-top>
          <p className={s.eyebrow}><Link href="/merch/orders">← My merch orders</Link></p>
          <h1 className={s.title}>Order {ref}</h1>
          {state.loading && <p className={s.muted}>Loading order…</p>}
          {!state.loading && !o && (
            <p className={s.muted}>We could not find this order. Open it from the link in your confirmation email, or log in with the account you ordered with.</p>
          )}
          {o && <ProofCard order={o} onAnswered={reload} />}
          {o && (
            <div className={s.layout}>
              <div className={s.card}>
                <p className={s.status}>{orderStatusLabel(o.status)}</p>
                {step >= 0 && (
                  <ol className={s.steps} aria-label="Order progress">
                    {ORDER_STEPS.map((st, i) => (
                      <li key={st.id} data-state={i < step ? 'done' : i === step ? 'now' : 'todo'} aria-current={i === step ? 'step' : undefined}>{st.label}</li>
                    ))}
                  </ol>
                )}
                <dl className={s.facts}>
                  <div><dt>Product</dt><dd>{product?.label || o.productId}</dd></div>
                  <div><dt>Sizes</dt><dd>{o.lines.map((l) => `${l.size} × ${l.qty}`).join(', ')}</dd></div>
                  {merchPositions(o.productId).filter((p) => o.design?.slots?.[p.id]).map((p) => (
                    <div key={p.id}><dt>{p.label}</dt><dd>{logoName(o.design.slots[p.id])}</dd></div>
                  ))}
                  <div><dt>Delivery</dt><dd>{o.delivery === 'pickup' ? `Club pickup${o.contact.club ? `, ${o.contact.club}` : ''}` : [o.address?.line1, o.address?.line2, o.address?.city, o.address?.postcode].filter(Boolean).join(', ')}</dd></div>
                  {o.notes && <div><dt>Notes</dt><dd>{o.notes}</dd></div>}
                  <div><dt>Placed</dt><dd>{day(o.createdAt)}</dd></div>
                </dl>
              </div>
              <div className={s.card}>
                <h2 className={s.h2}>Quote</h2>
                <div className={s.row}><span>{q.units} items</span><span>{nzd((q.goodsCents || 0) + (q.discountCents || 0))}</span></div>
                {q.discountCents > 0 && <div className={s.row}><span>Sponsor discount</span><span className={s.gold}>−{nzd(q.discountCents)}</span></div>}
                <div className={s.row}><span>{o.delivery === 'pickup' ? 'Club pickup' : 'Courier'}</span><span>{q.shippingCents ? nzd(q.shippingCents) : 'Free'}</span></div>
                <div className={`${s.row} ${s.total}`}><span>Total</span><span>{nzd(o.totalCents)}</span></div>
                <p className={s.muted}>Includes {nzd(q.gstCents)} GST. Nothing is charged until you approve the artwork proof.</p>
              </div>
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

// The latest artwork proof and the buyer's answer to it. Shown once a
// proof exists; buttons only while it waits for an answer.
function ProofCard({ order, onAnswered }) {
  const events = order.events || [];
  const proofAt = events.map((e) => e.status).lastIndexOf('proof_sent');
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (proofAt < 0) return null;
  const proof = events[proofAt];
  const answer = events.slice(proofAt + 1).find((e) => e.status === 'approved' || e.status === 'changes_requested');
  const waiting = order.status === 'proof_sent';

  async function send(decision) {
    if (decision === 'changes' && note.trim().length < 3) return setError('Tell us what to change.');
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`${API}/api/merch/orders/${encodeURIComponent(order.ref)}/proof-response`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: linkToken(), decision, note: decision === 'changes' ? note : '' }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not send your answer, try again.');
      await onAnswered();
    } catch (e) {
      setError(e.message.charAt(0).toUpperCase() + e.message.slice(1));
    }
    setBusy(false);
  }

  return (
    <div className={`${s.card} ${s.proof}`}>
      <h2 className={s.h2}>Artwork proof</h2>
      <p className={s.muted}>Sent {day(proof.at)}. This is how your logos will be printed.</p>
      <a href={`${API}${proof.proofPath}`} target="_blank" rel="noreferrer" className={s.proofLink}>
        <SmartImage src={`${API}${proof.proofPath}`} alt={`Artwork proof for order ${order.ref}`} className={s.proofImg}
          width={1200} height={900} unoptimized priority />
      </a>
      {proof.note && <p className={s.note}><strong>Note from us:</strong> {proof.note}</p>}
      {answer?.status === 'approved' && <p className={s.ok}>You approved this proof on {day(answer.at)}. Payment opens next.</p>}
      {answer?.status === 'changes_requested' && (
        <>
          <p className={s.note}><strong>You asked for changes:</strong> {answer.note}</p>
          <p className={s.muted}>We will send you a new proof by email.</p>
        </>
      )}
      {waiting && (
        <div className={s.answer}>
          {asking && (
            <label className={s.field}>
              <span>What should we change?</span>
              <textarea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Make the back logo bigger and move the club name lower" />
            </label>
          )}
          {error && <p className={s.err} role="alert">{error}</p>}
          <div className={s.actions}>
            {!asking && <button type="button" className={s.primary} disabled={busy} onClick={() => send('approve')}>{busy ? 'Sending…' : 'Approve proof'}</button>}
            {!asking && <button type="button" className={s.ghost} disabled={busy} onClick={() => setAsking(true)}>Request changes</button>}
            {asking && <button type="button" className={s.primary} disabled={busy} onClick={() => send('changes')}>{busy ? 'Sending…' : 'Send change request'}</button>}
            {asking && <button type="button" className={s.ghost} disabled={busy} onClick={() => { setAsking(false); setError(''); }}>Cancel</button>}
          </div>
          <p className={s.muted}>Approving locks the design for printing. You pay only after approving.</p>
        </div>
      )}
    </div>
  );
}
