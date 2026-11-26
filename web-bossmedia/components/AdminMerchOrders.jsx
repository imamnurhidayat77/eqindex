'use client';
// Admin > Merch orders: the order list, and each order on its own page with
// the buyer's design in 3D, artwork and the art proof step. Sending a proof moves the order to proof_sent and
// emails the buyer, who approves it or asks for changes on their order page.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useNotify } from './Toaster';
import SmartImage from './SmartImage';
import MerchOrderDesign from './MerchOrderDesign';
import { nzdc, studio, studioFetch } from '../lib/studio';
import { merchColorName, merchProduct } from '../lib/merch.mjs';
import { API } from '../lib/api';
import s from './AdminMerchOrders.module.css';

const STATUSES = ['submitted', 'artwork_review', 'changes_requested', 'proof_sent', 'approved',
  'paid', 'in_production', 'shipped', 'delivered', 'cancelled', 'refunded'];
const PROOF_FROM = ['submitted', 'artwork_review', 'changes_requested', 'proof_sent'];
// Unpaid orders an admin may cancel; cancelling releases the sponsor hold.
const CANCEL_FROM = [...PROOF_FROM, 'approved'];
const PROOF_MAX_BYTES = 15 * 1024 * 1024;
// After payment: the one next step and its button. Pickup orders are
// collected at the club instead of shipped.
const FULFILMENT_STEPS = {
  paid: { to: 'in_production', label: () => 'Mark in production' },
  in_production: { to: 'shipped', label: (pickup) => (pickup ? 'Mark ready to collect' : 'Mark shipped'), note: true },
  shipped: { to: 'delivered', label: (pickup) => (pickup ? 'Mark collected' : 'Mark delivered') },
};
const statusName = (st) => st.charAt(0).toUpperCase() + st.slice(1).replace(/_/g, ' ');
const day = (d) => new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });

// What the admin does next, per status (the list's "Next" column and the
// detail page's action card). `act` marks a step waiting on us.
const NEXT = {
  submitted: { text: 'Send proof', act: true },
  artwork_review: { text: 'Send proof', act: true },
  changes_requested: { text: 'Send new proof', act: true },
  proof_sent: { text: 'Waiting for buyer to approve' },
  approved: { text: 'Waiting for payment' },
  paid: { text: 'Start production', act: true },
  in_production: { text: 'Ship or hand over', act: true },
  shipped: { text: 'Confirm delivered', act: true },
};
// Payment events store the Stripe reference (kept for the audit trail);
// people read what happened instead.
const eventNote = (e) => (e.status === 'paid' && /^Stripe (pi|cs)_/.test(e.note || '') ? 'Paid by card through Stripe' : e.note);
const orderHref = (ref) => `/studio/admin/merch/orders/${encodeURIComponent(ref)}`;

export default function AdminMerchOrders() {
  const notify = useNotify();
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState(null);
  const load = useCallback(() => {
    studio.get(`/admin/merch/orders${status ? `?status=${status}` : ''}`).then((r) => setRows(r || [])).catch((e) => notify(e.message, true));
  }, [status, notify]);
  useEffect(() => { load(); }, [load]);
  const todo = (rows || []).filter((r) => NEXT[r.status]?.act).length;

  return (
    <>
      <div className={s.toolbar}>
        <label className={s.filter}><span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All orders</option>
            {STATUSES.map((st) => <option key={st} value={st}>{statusName(st)}</option>)}
          </select>
        </label>
        {rows?.length > 0 && <span className={s.summary}>{rows.length} order{rows.length === 1 ? '' : 's'}{todo ? ` · ${todo} need${todo === 1 ? 's' : ''} you` : ''}</span>}
      </div>
      {rows === null && <p className="empty-note">Loading…</p>}
      {rows?.length === 0 && <p className="empty-note">No orders{status ? ` with status ${statusName(status).toLowerCase()}` : ''}.</p>}
      {rows?.length > 0 && (
        <div className="st-card" style={{ padding: '6px 22px' }}>
          <div className="table-scroll"><table className={`st-table ${s.table}`}>
            <thead><tr><th>Order</th><th>Buyer</th><th>Product</th><th>Items</th><th>Total</th><th>Status</th><th>Next</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ref}>
                  <td><Link className={s.refLink} href={orderHref(r.ref)}>{r.ref}</Link><br /><small className={s.muted}>{day(r.created_at)}</small></td>
                  <td>{r.buyer_name}<br /><small className={s.muted}>{r.buyer_email}{r.club_name ? ` · ${r.club_name}` : ''}</small></td>
                  <td>{r.product_label || r.product_id}</td>
                  <td>{r.units}</td>
                  <td className={s.num}>{nzdc(r.total_cents)}</td>
                  <td><span className={s.status} data-status={r.status}>{statusName(r.status)}</span></td>
                  <td><span className={s.next} data-act={NEXT[r.status]?.act ? 'true' : undefined}>{NEXT[r.status]?.text || '—'}</span></td>
                  <td><Link className="st-btn-ghost" style={{ minHeight: 36 }} href={orderHref(r.ref)} aria-label={`Open order ${r.ref}`}>Open →</Link></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </>
  );
}

// One order on its own page (/studio/admin/merch/orders/<ref>): the design
// in 3D, the next step, buyer, delivery, money and history.
export function AdminMerchOrderDetail({ orderRef }) {
  const notify = useNotify();
  const [o, setO] = useState(null);
  const [missing, setMissing] = useState(false);
  const load = useCallback(() => {
    studio.get(`/api/merch/orders/${encodeURIComponent(orderRef)}`).then(setO).catch((e) => { setMissing(true); notify(e.message, true); });
  }, [orderRef, notify]);
  useEffect(() => { load(); }, [load]);

  const back = <Link href="/studio/admin?section=orders" className={s.back}>← Merch orders</Link>;
  if (missing && !o) return <div className={s.page}>{back}<p className="empty-note">Order {orderRef} not found.</p></div>;
  if (!o) return <div className={s.page}>{back}<p className="empty-note">Loading {orderRef}…</p></div>;
  const q = o.quote || {};
  const units = o.lines.reduce((n, l) => n + l.qty, 0);
  const label = q.product?.label || merchProduct(o.productId)?.label || o.productId;
  const colour = q.product?.colorName || merchColorName(o.productId, o.color);
  const next = NEXT[o.status];
  const artwork = (o.artwork || []).length > 0 && (
    <div className={s.artwork}>
      <span className={s.label}>Buyer artwork (original files)</span>
      <div className={s.links}>
        {o.artwork.map((a, i) => a.url
          ? <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className={s.fileLink}>↓ Upload {i + 1} <small>{a.width}×{a.height}px</small></a>
          : <span key={a.id} className={s.muted}>Upload {i + 1} unavailable</span>)}
      </div>
    </div>
  );
  return (
    <div className={s.page}>
      {back}
      <header className={s.head}>
        <div className={s.headRow}>
          <h2 className={s.title}>{o.ref}</h2>
          <span className={s.status} data-status={o.status}>{statusName(o.status)}</span>
        </div>
        <p className={s.sub}>{label} · {colour} · {units} item{units === 1 ? '' : 's'} · placed {day(o.createdAt)} · {nzdc(o.totalCents)}</p>
      </header>
      <div className={s.layout}>
        {merchProduct(o.productId)
          ? <MerchOrderDesign order={o} title="Design" hint="View only · drag to turn" extra={artwork} />
          : <div className="st-card">{artwork}</div>}
        <aside className={s.side}>
          <section className={`${s.panel} ${next?.act ? s.panelAct : ''}`} aria-label="Next step">
            <span className={s.label}>Next step</span>
            <p className={s.nextTitle}>{next?.text || 'Nothing to do'}</p>
            {PROOF_FROM.includes(o.status) && <SendProof orderRef={o.ref} resend={o.status === 'proof_sent'} onSent={load} />}
            {FULFILMENT_STEPS[o.status] && <NextStep order={o} onMoved={load} />}
            {o.status === 'approved' && <p className={s.hint}>Proof approved. The buyer pays on their order page.</p>}
          </section>
          <section className={s.panel} aria-label="Buyer">
            <span className={s.label}>Buyer</span>
            <dl className={s.facts}>
              <div><dt>Name</dt><dd>{o.contact.name}</dd></div>
              <div><dt>Email</dt><dd><a href={`mailto:${o.contact.email}`}>{o.contact.email}</a></dd></div>
              {o.contact.phone && <div><dt>Phone</dt><dd><a href={`tel:${o.contact.phone.replace(/\s/g, '')}`}>{o.contact.phone}</a></dd></div>}
              {o.contact.club && <div><dt>Club</dt><dd>{o.contact.club}</dd></div>}
              <div><dt>{o.delivery === 'pickup' ? 'Pickup' : 'Deliver to'}</dt><dd>{o.delivery === 'pickup' ? `Club pickup, ${o.contact.club}` : [o.address?.line1, o.address?.line2, o.address?.city, o.address?.postcode].filter(Boolean).join(', ')}</dd></div>
              {o.notes && <div><dt>Notes</dt><dd>{o.notes}</dd></div>}
            </dl>
          </section>
          <section className={s.panel} aria-label="Order">
            <span className={s.label}>Order</span>
            <dl className={s.facts}>
              <div><dt>Sizes</dt><dd>{o.lines.map((l) => `${l.size} × ${l.qty}`).join(', ')}</dd></div>
              <div><dt>Goods</dt><dd>{nzdc((q.goodsCents || 0) + (q.discountCents || 0))}</dd></div>
              {q.discountCents > 0 && <div><dt>Sponsor discount</dt><dd>−{nzdc(q.discountCents)}</dd></div>}
              <div><dt>{o.delivery === 'pickup' ? 'Pickup' : 'Courier'}</dt><dd>{q.shippingCents ? nzdc(q.shippingCents) : 'Free'}</dd></div>
              <div className={s.totalRow}><dt>Total</dt><dd>{nzdc(o.totalCents)}</dd></div>
            </dl>
          </section>
          <section className={s.panel} aria-label="History">
            <span className={s.label}>History</span>
            <ol className={s.timeline}>
              {[...o.events].reverse().map((e, i) => (
                <li key={e.id} className={s.event} data-latest={i === 0 ? 'true' : undefined}>
                  <span className={s.eventDot} aria-hidden="true" />
                  <div className={s.eventBody}>
                    <div className={s.eventHead}>
                      <strong>{statusName(e.status)}</strong>
                      <time className={s.muted} dateTime={e.at}>{day(e.at)}</time>
                    </div>
                    {e.note && <p className={s.note}>{eventNote(e)}</p>}
                    {e.proofFiles?.length > 0 && (
                      <ul className={s.proofThumbs} aria-label="Proof files">
                        {e.proofFiles.map((f, n) => (
                          <li key={f.path}>
                            <a href={`${API}${f.path}`} target="_blank" rel="noreferrer" className={s.thumbLink}
                              aria-label={`Open ${f.label || `file ${n + 1}`} of the proof sent ${day(e.at)}`}>
                              {f.kind === 'pdf'
                                ? <span className={s.pdfBadge} aria-hidden="true">PDF</span>
                                : <SmartImage src={`${API}${f.path}`} alt={f.label || `Proof file ${n + 1}`} className={s.thumb} width={f.width || 320} height={f.height || 240} unoptimized
                                  style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
                              {f.label && <span className={s.thumbLabel}>{f.label}</span>}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
          {CANCEL_FROM.includes(o.status) && <CancelOrder order={o} onCancelled={load} />}
        </aside>
      </div>
    </div>
  );
}

function CancelOrder({ order, onCancelled }) {
  const notify = useNotify();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  async function cancel(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await studioFetch(`/admin/merch/orders/${order.ref}/cancel`, { method: 'POST', body: { note } });
      notify('Order cancelled, its sponsor discount is released');
      onCancelled();
    } catch (err) { notify(err.message, true); setBusy(false); }
  }
  if (!asking) {
    return <div className={s.dangerRow}><button className={`st-btn-ghost ${s.danger}`} type="button" onClick={() => setAsking(true)}>Cancel order</button></div>;
  }
  return (
    <form className={`${s.panel} ${s.send}`} onSubmit={cancel}>
      <h4 className={s.h4}>Cancel {order.ref}</h4>
      <label className={s.field}><span>Reason, shown on the order (optional)</span>
        <input type="text" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. No reply to the proof for two weeks" />
      </label>
      <p className={s.hint}>{order.status === 'approved'
        ? 'If the buyer pays on a Stripe page that is already open, the payment is logged and you refund it in Stripe.'
        : 'The buyer can no longer answer the proof or pay.'}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="st-btn" type="submit" disabled={busy}>{busy ? 'Cancelling…' : 'Yes, cancel order'}</button>
        <button className="st-btn-ghost" type="button" disabled={busy} onClick={() => setAsking(false)}>Keep it</button>
      </div>
    </form>
  );
}

// Drop or pick the proof, see it before it goes to the buyer. The server
// re-checks type and size; this only saves a round trip.
const PROOF_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
const PROOF_MAX_FILES = 8; // same limits as the API (merch.js)
const PROOF_MAX_TOTAL = 40 * 1024 * 1024;
// Labels offered in order, so four files dropped at once read as the four views.
const VIEW_LABELS = ['Front', 'Back', 'Left', 'Right', 'Detail'];
const mb = (n) => `${(n / 1024 / 1024).toFixed(n < 1024 * 1024 ? 2 : 1)} MB`;
let fileSeq = 0;

// Drop or pick one or more proof files (front, back, sides…), label and
// order them, and see each before it goes to the buyer. The server re-checks
// every file; these checks only save a round trip.
function SendProof({ orderRef, resend, onSent }) {
  const notify = useNotify();
  const [items, setItems] = useState([]); // { id, file, url, pdf, w, h, label }
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const urls = useRef(new Set());
  useEffect(() => () => { urls.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  function add(list) {
    const files = [...(list || [])];
    if (!files.length) return;
    const room = PROOF_MAX_FILES - items.length;
    const problems = [];
    const ok = [];
    for (const f of files) {
      if (ok.length >= room) { problems.push(`At most ${PROOF_MAX_FILES} files per proof.`); break; }
      if (!PROOF_TYPES.includes(f.type)) { problems.push(`${f.name}: use a PDF, PNG, JPEG or WebP file.`); continue; }
      if (f.size > PROOF_MAX_BYTES) { problems.push(`${f.name} is ${mb(f.size)}, 15 MB at most.`); continue; }
      ok.push(f);
    }
    const total = [...items.map((x) => x.file), ...ok].reduce((n, f) => n + f.size, 0);
    if (total > PROOF_MAX_TOTAL) { setError(`All files together are ${mb(total)}, 40 MB at most.`); return; }
    setError(problems.join(' '));
    const next = ok.map((f, i) => {
      const url = URL.createObjectURL(f);
      urls.current.add(url);
      return { id: ++fileSeq, file: f, url, pdf: f.type === 'application/pdf', w: 0, h: 0, label: VIEW_LABELS[items.length + i] || '' };
    });
    setItems((cur) => [...cur, ...next]);
    for (const it of next.filter((x) => !x.pdf)) {
      const img = new Image();
      img.onload = () => setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, w: img.naturalWidth, h: img.naturalHeight } : x)));
      img.onerror = () => { setItems((cur) => cur.filter((x) => x.id !== it.id)); setError(`${it.file.name} could not be read.`); };
      img.src = it.url;
    }
    if (inputRef.current) inputRef.current.value = '';
  }
  const patch = (id, p) => setItems((cur) => cur.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const remove = (id) => setItems((cur) => cur.filter((x) => x.id !== id));
  const move = (i, by) => setItems((cur) => {
    const j = i + by;
    if (j < 0 || j >= cur.length) return cur;
    const next = [...cur];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  async function send(e) {
    e.preventDefault();
    if (!items.length) { setError('Add at least one proof file.'); return; }
    const form = new FormData();
    for (const it of items) form.append('proof', it.file);
    form.append('labels', JSON.stringify(items.map((it) => it.label.trim())));
    form.append('note', note);
    setBusy(true);
    try {
      const j = await studioFetch(`/admin/merch/orders/${orderRef}/proof`, { method: 'POST', form });
      notify(j.data?.mailed ? 'Proof sent, the buyer has been emailed' : 'Proof saved, but the email failed. Send the buyer their order link.', !j.data?.mailed);
      setItems([]);
      setNote('');
      onSent();
    } catch (err) { notify(err.message, true); }
    setBusy(false);
  }

  const inputId = `proof-${orderRef}`;
  return (
    <form className={s.send} onSubmit={send}>
      {resend && <p className={s.hint}>A proof is already waiting for the buyer. A new one replaces it.</p>}
      <input ref={inputRef} id={inputId} type="file" multiple accept={PROOF_TYPES.join(',')} className={s.srOnly}
        onChange={(e) => add(e.target.files)} />
      {items.length > 0 && (
        <ol className={s.files} aria-label="Proof files, in the order the buyer sees them">
          {items.map((it, i) => (
            <li key={it.id} className={s.fileCard}>
              <a href={it.url} target="_blank" rel="noreferrer" className={s.fileThumb} aria-label={`Open ${it.file.name}`}>
                {it.pdf
                  ? <span className={s.pdfBadge} aria-hidden="true">PDF</span>
                  : <SmartImage src={it.url} alt={`Proof file ${i + 1}`} width={it.w || 400} height={it.h || 300} unoptimized style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
                <span className={s.fileNum} aria-hidden="true">{i + 1}</span>
              </a>
              <input className={s.fileLabel} value={it.label} maxLength={30} list="proof-views" placeholder="Label, e.g. Front"
                aria-label={`Label for file ${i + 1}`} onChange={(e) => patch(it.id, { label: e.target.value })} />
              <div className={s.fileRow}>
                <small className={s.muted} title={`${it.file.name} · ${it.pdf ? 'PDF' : `${it.w}×${it.h}px`} · ${mb(it.file.size)}`}>{mb(it.file.size)}</small>
                <span className={s.fileTools}>
                  <button type="button" className={s.iconBtn} onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move file ${i + 1} earlier`}>←</button>
                  <button type="button" className={s.iconBtn} onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`Move file ${i + 1} later`}>→</button>
                  <button type="button" className={s.iconBtn} onClick={() => remove(it.id)} aria-label={`Remove file ${i + 1}`}>×</button>
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
      <datalist id="proof-views">{VIEW_LABELS.map((v) => <option key={v} value={v} />)}</datalist>
      {items.length < PROOF_MAX_FILES && (
        <label htmlFor={inputId} className={s.drop} data-over={over ? 'true' : undefined} data-compact={items.length ? 'true' : undefined}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}>
          <span className={s.dropIcon} aria-hidden="true">{items.length ? '+' : '↑'}</span>
          <span className={s.dropTitle}>{items.length ? <>Add more views or <u>browse</u></> : <>Drop the proof files here or <u>browse</u></>}</span>
          <small className={s.muted}>Front, back, sides, details · PDF, PNG, JPEG or WebP · up to {PROOF_MAX_FILES} files</small>
        </label>
      )}
      {error && <p className={s.err} role="alert">{error}</p>}
      <label className={s.field}><span>Note to the buyer (optional)</span>
        <textarea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. We moved the club logo up 2 cm so it clears the zip" />
      </label>
      <div><button className="st-btn" type="submit" disabled={busy || !items.length}>
        {busy ? 'Sending…' : items.length > 1 ? `Send ${items.length} views to buyer` : 'Send proof to buyer'}
      </button></div>
    </form>
  );
}

function NextStep({ order, onMoved }) {
  const notify = useNotify();
  const step = FULFILMENT_STEPS[order.status];
  const pickup = order.delivery === 'pickup';
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function move(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const j = await studioFetch(`/admin/merch/orders/${order.ref}/status`, { method: 'POST', body: { status: step.to, note } });
      if (j.data?.mailed === false) notify('Status saved, but the email failed. Let the buyer know yourself.', true);
      else notify(j.data?.mailed ? 'Status saved, the buyer has been emailed' : 'Status saved');
      setNote('');
      onMoved();
    } catch (err) { notify(err.message, true); }
    setBusy(false);
  }

  return (
    <form className={s.send} onSubmit={move}>
      {step.note && (
        <label className={s.field}><span>{pickup ? 'Pickup details for the buyer (optional)' : 'Courier and tracking number (optional)'}</span>
          <input type="text" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={pickup ? 'e.g. At the club office, Saturdays 9 to 12' : 'e.g. NZ Post, tracking AB123456789NZ'} />
        </label>
      )}
      {step.note && <p className={s.hint}>The buyer is emailed when you save this step.</p>}
      <div><button className="st-btn" type="submit" disabled={busy}>{busy ? 'Saving…' : step.label(pickup)}</button></div>
    </form>
  );
}

