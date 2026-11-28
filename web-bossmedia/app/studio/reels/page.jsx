'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import StudioShell, { Chip, Pager } from '../../../components/studio';
import ReelPickerModal from '../../../components/ReelPickerModal';
import { useNotify } from '../../../components/Toaster';
import { useConfirm } from '../../../components/ConfirmModal';
import { studio } from '../../../lib/studio';
import { daysSince, fmtDay, nzdc, statusLabel, waitedFor } from '../../../lib/studio-format.mjs';
import { useDocumentTitle } from '../../../lib/use-document-title';
import s from '../../../components/ReelOrders.module.css';

const LIMIT = 20;
// A paid order untouched this long is flagged so it does not slip.
const LATE_AFTER_DAYS = 3;

const FLOW = {
  awaiting_payment: ['pending', 'cancelled'],
  pending: ['in_production', 'cancelled'],
  in_production: ['ready', 'cancelled'],
  ready: ['delivered', 'cancelled'],
  delivered: [], cancelled: [],
};
const ORDER = ['awaiting_payment', 'pending', 'in_production', 'ready', 'delivered', 'cancelled'];
const OPEN = ['awaiting_payment', 'pending', 'in_production', 'ready'];
const NEEDS_ADMIN = ['pending', 'in_production', 'ready'];

// Human verbs for the state machine. The raw status names are for the API.
const ACTION = {
  pending: 'Accept order',
  in_production: 'Start work',
  ready: 'Mark ready',
  delivered: 'Deliver to buyer',
};
const actionLabel = (st) => ACTION[st] || st.replace(/_/g, ' ');

export default function ReelsPage() {
  useDocumentTitle('Pre-book orders');
  const notify = useNotify();
  const [orders, setOrders] = useState(null);
  const [filter, setFilter] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [offset, setOffset] = useState(0);
  const [picking, setPicking] = useState(null);

  const load = useCallback(() => { studio.get('/admin/reel-orders').then((r) => setOrders(r || [])).catch((e) => notify(e.message, true)); }, [notify]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setOffset(0); }, [filter]);

  const counts = useMemo(() => {
    const c = {};
    for (const o of orders || []) c[o.status] = (c[o.status] || 0) + 1;
    return c;
  }, [orders]);

  const visible = (orders || []).filter((o) => !filter || o.status === filter);
  const safeOffset = Math.min(offset, Math.max(0, (Math.ceil(visible.length / LIMIT) - 1) * LIMIT));
  const pageOrders = visible.slice(safeOffset, safeOffset + LIMIT);
  const queue = (orders || []).filter((o) => NEEDS_ADMIN.includes(o.status)).length;

  const patchOrder = (id, u) => setOrders((xs) => (xs || []).map((x) => (x.id === id ? { ...x, ...u } : x)));

  async function advance(o, to, extra = {}) {
    setBusyId(o.id);
    try {
      const u = await studio.patch(`/admin/reel-orders/${o.id}`, { status: to, ...extra });
      patchOrder(o.id, { ...(u.data || u), status: to });
      notify(to === 'cancelled' ? 'Order cancelled' : `Order: ${actionLabel(to).toLowerCase()}`);
    } catch (e) { notify(e.message, true); }
    setBusyId(null);
  }

  // Linking the first reel also marks the order ready. Changing it only swaps the file.
  async function saveReel(o, mediaId) {
    if (o.media_id) {
      await studio.patch(`/admin/reel-orders/${o.id}`, { media_id: mediaId });
      patchOrder(o.id, { media_id: mediaId });
      notify('Reel changed');
    } else {
      const u = await studio.patch(`/admin/reel-orders/${o.id}`, { status: 'ready', media_id: mediaId });
      patchOrder(o.id, { ...(u.data || u), status: 'ready', media_id: mediaId });
      notify('Reel linked. Order is ready to deliver.');
    }
  }

  const closePicker = useCallback(() => setPicking(null), []);

  return (
    <StudioShell active="reels" kpis={{ reels: queue }}>
      <div className={s.toolbar}>
        <div className={s.tabs} role="group" aria-label="Filter by status">
          <button type="button" className={s.tab} aria-pressed={!filter} onClick={() => setFilter('')}>
            All <span className={s.count}>{(orders || []).length}</span>
          </button>
          {ORDER.filter((st) => counts[st]).map((st) => (
            <button type="button" key={st} className={s.tab} aria-pressed={filter === st} onClick={() => setFilter(filter === st ? '' : st)}>
              {statusLabel(st)} <span className={s.count}>{counts[st]}</span>
            </button>
          ))}
        </div>
        {orders?.length > 0 && (
          <p className={s.summary}>{queue ? <><strong>{queue}</strong> order{queue === 1 ? '' : 's'} need{queue === 1 ? 's' : ''} you</> : 'Nothing waiting on you'}</p>
        )}
      </div>
      {orders === null ? <p className="empty-note">Loading…</p> : !visible.length ? (
        <div className="event-media-empty">
          <p className="eyebrow">No pre-book orders</p>
          <h3>{filter ? 'Nothing in this state.' : 'The queue is empty.'}</h3>
          <Link href="/studio/pricing" style={{ paddingBottom: 5, borderBottom: '1px solid #666', fontSize: 12, color: '#bbb' }}>Check reel products are published</Link>
        </div>
      ) : (
        <div className={`st-card ${s.card}`}>
          <div className="table-scroll"><table className={`st-table ${s.table}`}>
            <thead><tr><th>Order</th><th>Buyer</th><th>Horse and event</th><th>Price</th><th>Waiting</th><th>Status</th><th><span className={s.srOnly}>Actions</span></th></tr></thead>
            <tbody>
              {pageOrders.map((o) => (
                <OrderRow key={o.id} o={o} busy={busyId === o.id} onAdvance={advance} onPickReel={() => setPicking(o)} />
              ))}
            </tbody>
          </table></div>
        </div>
      )}
      <Pager total={visible.length} limit={LIMIT} offset={safeOffset} onPage={setOffset} />
      {picking && <ReelPickerModal order={picking} onClose={closePicker} onSave={(id) => saveReel(picking, id)} />}
    </StudioShell>
  );
}

function OrderRow({ o, busy, onAdvance, onPickReel }) {
  const [confirmUI, dialog] = useConfirm();
  const nexts = (FLOW[o.status] || []).filter((st) => st !== 'cancelled' && !(st === 'pending' && o.payment_status !== 'paid'));
  const open = OPEN.includes(o.status);
  const late = NEEDS_ADMIN.includes(o.status) && daysSince(o.created_at) >= LATE_AFTER_DAYS;
  const details = [o.class_name, o.ring && `Ring ${o.ring}`, o.back_number && `No. ${o.back_number}`].filter(Boolean).join(' · ');
  const paid = o.payment_status === 'paid';

  async function cancel() {
    const ok = await dialog.confirm({
      title: `Cancel ${o.product_name} for ${o.horse_name || 'this buyer'}?`,
      message: paid
        ? `The buyer paid ${nzdc(o.price_cents)}. Cancelling does not refund them, so refund it in Stripe too.`
        : 'The buyer has not paid yet, so nothing needs refunding.',
      confirmLabel: 'Cancel order',
      danger: true,
    });
    if (ok) onAdvance(o, 'cancelled');
  }

  return (
    <tr>
      <td className={s.cOrder}>
        <span className={s.primary}>{o.product_name}</span>
        <span className={s.sub}>Ordered {fmtDay(o.created_at)}{details ? ` · ${details}` : ''}</span>
        {o.media_id && o.status !== 'cancelled' && <span className={s.linked}>Reel linked</span>}
      </td>
      <td className={`${s.buyer} ${s.cBuyer}`}>
        <a href={`mailto:${o.buyer_email}`}>{o.buyer_email}</a>
        {o.phone && <span className={s.sub}><a href={`tel:${o.phone}`}>{o.phone}</a></span>}
      </td>
      <td className={s.cHorse}>
        <span className={s.primary}>{o.horse_name || '—'}</span>
        <span className={s.sub}>{o.event_name || 'No event picked'}{o.shooting_date ? ` · ${fmtDay(o.shooting_date)}` : ''}</span>
      </td>
      <td className={`${s.num} ${s.cPrice}`}><span className={s.cellLabel}>Price </span>{nzdc(o.price_cents)}</td>
      <td className={s.cAge}>
        <span className={s.cellLabel}>Waiting </span>
        {open
          ? <span className={s.age} data-late={late ? 'true' : undefined} title={late ? `Paid order waiting ${LATE_AFTER_DAYS}+ days` : undefined}>{waitedFor(o.created_at)}</span>
          : <span className={s.muted}>—</span>}
      </td>
      <td className={s.cStatus}>
        <Chip status={o.status} />
        {o.payment_status === 'refunded' && <> <Chip status="refunded" /></>}
      </td>
      <td className={s.cActions}>
        <div className={s.actions}>
          {/* Payment is confirmed by Stripe, never by hand: the API refuses until the purchase is paid. */}
          {o.status === 'awaiting_payment' && !paid && <span className={s.hint}>Waiting for the buyer to pay</span>}
          {nexts.map((st, i) => (
            st === 'ready' && !o.media_id ? (
              <button type="button" key={st} className={i === 0 ? 'st-btn' : 'st-btn-ghost'} disabled={busy} onClick={onPickReel}>Link reel…</button>
            ) : (
              <button type="button" key={st} className={i === 0 ? 'st-btn' : 'st-btn-ghost'} disabled={busy} onClick={() => onAdvance(o, st)}>
                {busy ? 'Working…' : actionLabel(st)}
              </button>
            )
          ))}
          {o.media_id && !['delivered', 'cancelled'].includes(o.status) && (
            <button type="button" className="st-btn-ghost" disabled={busy} onClick={onPickReel}>Change reel</button>
          )}
          {(FLOW[o.status] || []).includes('cancelled') && (
            <button type="button" className={s.cancel} disabled={busy} onClick={cancel}>Cancel order</button>
          )}
        </div>
        {confirmUI}
      </td>
    </tr>
  );
}
