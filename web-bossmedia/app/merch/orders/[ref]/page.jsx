'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { SiteFooter, SiteHeader } from '../../../../components/figma';
import SmartImage from '../../../../components/SmartImage';
import { API } from '../../../../lib/api';
import { isHorseProduct, merchColorName, merchPositions, merchProduct } from '../../../../lib/merch.mjs';
import stage from '../../../../components/MerchClient.module.css';
import { ORDER_STEPS, orderStatusLabel, orderStepIndex } from '../../../../lib/merch-order-status.mjs';
import { useDocumentTitle } from '../../../../lib/use-document-title';
import s from '../orders.module.css';

const nzd = (c) => `NZ$${(Number(c || 0) / 100).toFixed(2)}`;
const PAID_STATUSES = ['paid', 'in_production', 'shipped', 'delivered'];
// Same list as the API: the buyer can cancel until the proof is approved.
const CANCEL_FROM = ['submitted', 'artwork_review', 'changes_requested', 'proof_sent'];
const day = (d) => new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
const linkToken = () => new URLSearchParams(window.location.search).get('t') || '';
const Merch3D = dynamic(() => import('../../../../components/Merch3D'), { ssr: false, loading: () => <p className={s.muted}>Loading 3D preview…</p> });
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
  const reload = useCallback(() => load().then((order) => setState({ loading: false, order })), [load]);

  const o = state.order;
  const product = o ? merchProduct(o.productId) : null;
  const step = o ? orderStepIndex(o.status) : -1;
  const q = o?.quote || {};
  const shipped = o?.events?.findLast((e) => e.status === 'shipped');
  const units = o ? o.lines.reduce((n, l) => n + l.qty, 0) : 0;
  return (
    <div className="gallery-page">
      <SiteHeader />
      <main>
        <section className={`events-section gallery-browser section-gutter ${s.page}`} data-page-top>
          <p className={s.eyebrow}><Link href="/merch/orders">← My merch orders</Link></p>
          <div className={s.headRow}>
            <h1 className={s.title}>Order {ref}</h1>
            {o && <span className={s.pill} data-tone={PAID_STATUSES.includes(o.status) ? 'good' : o.status === 'cancelled' ? 'off' : 'wait'}>{orderStatusLabel(o.status, o.delivery)}</span>}
          </div>
          {o && <p className={s.sub}>Placed {day(o.createdAt)} · {product?.label || o.productId} in {merchColorName(o.productId, o.color)} · {units} item{units === 1 ? '' : 's'}</p>}
          {state.loading && <p className={s.muted}>Loading order…</p>}
          {!state.loading && !o && (
            <p className={s.muted}>We could not find this order. Open it from the link in your confirmation email, or log in with the account you ordered with.</p>
          )}
          {o && step >= 0 && (
            <ol className={s.track} aria-label="Order progress">
              {ORDER_STEPS.map((st, i) => (
                <li key={st.id} data-state={i < step ? 'done' : i === step ? 'now' : 'todo'} aria-current={i === step ? 'step' : undefined}>
                  <span className={s.trackDot} aria-hidden="true">{i < step ? '✓' : i + 1}</span>
                  <span className={s.trackLabel}>{st.label}</span>
                </li>
              ))}
            </ol>
          )}
          {o?.status === 'approved' && <PayCard order={o} onConfirmed={reload} />}
          {o && <ProofCard order={o} onAnswered={reload} />}
          {o && (
            <div className={s.orderGrid}>
              {product ? <DesignPreview order={o} /> : <div />}
              <aside className={s.side}>
                <div className={s.card}>
                  <h2 className={s.h2}>Summary</h2>
                  <div className={s.row}><span>{units} item{units === 1 ? '' : 's'}</span><span>{nzd((q.goodsCents || 0) + (q.discountCents || 0))}</span></div>
                  {q.discountCents > 0 && <div className={s.row}><span>Sponsor discount</span><span className={s.gold}>−{nzd(q.discountCents)}</span></div>}
                  <div className={s.row}><span>{o.delivery === 'pickup' ? 'Club pickup' : 'Courier'}</span><span>{q.shippingCents ? nzd(q.shippingCents) : 'Free'}</span></div>
                  <div className={`${s.row} ${s.total}`}><span>Total</span><span>{nzd(o.totalCents)}</span></div>
                  <p className={s.muted}>Includes {nzd(q.gstCents)} GST. {PAID_STATUSES.includes(o.status) ? 'Paid in full.' : 'Nothing is charged until you approve the artwork proof.'}</p>
                </div>
                <div className={s.card}>
                  <h2 className={s.h2}>Details</h2>
                  <dl className={s.facts}>
                    <div><dt>Sizes</dt><dd>{o.lines.map((l) => `${l.size} × ${l.qty}`).join(', ')}</dd></div>
                    <div><dt>{o.delivery === 'pickup' ? 'Pickup' : 'Deliver to'}</dt><dd>{o.delivery === 'pickup' ? `Club pickup${o.contact.club ? `, ${o.contact.club}` : ''}` : [o.address?.line1, o.address?.line2, o.address?.city, o.address?.postcode].filter(Boolean).join(', ')}</dd></div>
                    {o.notes && <div><dt>Notes</dt><dd>{o.notes}</dd></div>}
                    {shipped && <div><dt>{o.delivery === 'pickup' ? 'Ready' : 'Shipped'}</dt><dd>{day(shipped.at)}{shipped.note ? `, ${shipped.note}` : ''}</dd></div>}
                  </dl>
                  {CANCEL_FROM.includes(o.status) && <CancelOrder order={o} onCancelled={reload} />}
                </div>
              </aside>
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

// Two steps so a stray tap never cancels: ask, then confirm in place.
function CancelOrder({ order, onCancelled }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function cancel() {
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`${API}/api/merch/orders/${encodeURIComponent(order.ref)}/cancel`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: linkToken() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not cancel the order, try again.');
      await onCancelled();
    } catch (e) {
      setError(e.message.charAt(0).toUpperCase() + e.message.slice(1));
      setBusy(false);
    }
  }
  return (
    <>
      {error && <p className={s.err} role="alert">{error}</p>}
      <div className={s.actions}>
        {!asking && <button type="button" className={s.ghost} onClick={() => setAsking(true)}>Cancel order</button>}
        {asking && <button type="button" className={s.primary} disabled={busy} onClick={cancel}>{busy ? 'Cancelling…' : 'Yes, cancel this order'}</button>}
        {asking && <button type="button" className={s.ghost} disabled={busy} onClick={() => { setAsking(false); setError(''); }}>Keep it</button>}
      </div>
    </>
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
      {answer?.status === 'approved' && <p className={s.ok}>You approved this proof on {day(answer.at)}.</p>}
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

// Pay the approved total through Stripe Checkout. Back from Stripe
// (?paid=1) the webhook may still be on its way, so the order is re-read
// a few times before asking the buyer to refresh later.
const CONFIRM_TRIES = 5;
const CONFIRM_EVERY_MS = 2000;
function PayCard({ order, onConfirmed }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('paid') !== '1') return undefined;
    setConfirming(true);
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      onConfirmed();
      if (tries >= CONFIRM_TRIES) { clearInterval(timer); setConfirming(false); }
    }, CONFIRM_EVERY_MS);
    return () => clearInterval(timer);
  }, [onConfirmed]);

  async function pay() {
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`${API}/api/merch/orders/${encodeURIComponent(order.ref)}/checkout`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: linkToken() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.data?.url) throw new Error(j.error || 'Could not open the payment page, try again.');
      window.location.assign(j.data.url);
    } catch (e) {
      setError(e.message.charAt(0).toUpperCase() + e.message.slice(1));
      setBusy(false);
    }
  }

  return (
    <div className={`${s.card} ${s.proof}`}>
      <h2 className={s.h2}>Pay for your order</h2>
      {confirming
        ? <p className={s.ok} role="status">Thanks! We are confirming your payment, this page updates in a moment.</p>
        : (
          <>
            <p className={s.muted}>Your proof is approved. Pay {nzd(order.totalCents)} (incl. GST) and we start production.</p>
            {error && <p className={s.err} role="alert">{error}</p>}
            <div className={s.actions}>
              <button type="button" className={s.primary} disabled={busy} onClick={pay}>{busy ? 'Opening payment…' : `Pay ${nzd(order.totalCents)}`}</button>
            </div>
            <p className={s.muted}>Secure card payment by Stripe.</p>
          </>
        )}
    </div>
  );
}

// The product as ordered, on the same 3D view as the designer (view only).
// Own artwork (mlogo:) loads through the order's own logo route, with the
// link token when the page was opened from an email. Picking a placement
// in the list turns the model to face it.
function DesignPreview({ order }) {
  const stageRef = useRef(null);
  const design = order.design || {};
  const placed = merchPositions(order.productId).filter((p) => design.slots?.[p.id]);
  // Start on the first placement: Merch3D only turns to a slot when the
  // selection changes from one slot to another.
  const [selected, setSelected] = useState(() => placed[0]?.id || null);
  const slots = useMemo(() => {
    const t = linkToken();
    const out = {};
    for (const [pos, v] of Object.entries(design.slots || {})) {
      const id = String(v);
      out[pos] = id.startsWith('mlogo:')
        ? `upload:${API}/api/merch/orders/${encodeURIComponent(order.ref)}/logos/${id.slice(6)}${t ? `?t=${encodeURIComponent(t)}` : ''}`
        : id;
    }
    return out;
  }, [design.slots, order.ref]);
  const zoom = useMemo(() => Object.fromEntries(Object.entries(design.slotZoom || {}).map(([k, v]) => [k, Number(v) / 100])), [design.slotZoom]);
  // Logo names as quoted at order time ("Left chest: Pak'nSave").
  const names = useMemo(() => Object.fromEntries((order.quote?.item?.lines || [])
    .filter((l) => l.slot && ['sponsor', 'club', 'upload'].includes(l.kind))
    .map((l) => [l.slot, String(l.label).split(': ').slice(1).join(': ').replace(/ \(.*\)$|, no discount$/, '')])), [order.quote]);
  return (
    <section className={`${s.card} ${s.designCard}`} aria-label="Your design">
      <div className={s.cardHead}>
        <h2 className={s.h2}>Your design</h2>
        <span className={s.hint}>Drag to turn · the proof is final</span>
      </div>
      <div className={`${stage.stage}${isHorseProduct(order.productId) ? ` ${stage.stageDark}` : ''} ${s.designStage}`} ref={stageRef}>
        <Merch3D productId={order.productId} color={order.color} slots={slots} zoom={zoom} shift={design.slotShift || {}}
          selectedPos={selected} switching={false} stageRef={stageRef} clean={false} />
      </div>
      {placed.length > 0 && (
        <ul className={s.placements} aria-label="Logo placements">
          {placed.map((p, i) => (
            <li key={p.id}>
              <button type="button" className={s.placement} aria-pressed={selected === p.id} onClick={() => setSelected(p.id)}>
                <span className={s.placementNum} aria-hidden="true">{i + 1}</span>
                <span className={s.placementText}>
                  <strong>{p.label}</strong>
                  <small>{names[p.id] || logoName(design.slots[p.id])}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
