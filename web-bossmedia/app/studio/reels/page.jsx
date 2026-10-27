'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import StudioShell, { Chip, Pager } from '../../../components/studio';
import { useNotify } from '../../../components/Toaster';
import { useConfirm } from '../../../components/ConfirmModal';
import { dayOf, nzdc, studio } from '../../../lib/studio';

const LIMIT = 20;

const FLOW = {
  awaiting_payment: ['pending', 'cancelled'],
  pending: ['in_production', 'cancelled'],
  in_production: ['ready', 'cancelled'],
  ready: ['delivered', 'cancelled'],
  delivered: [], cancelled: [],
};
const ORDER = ['awaiting_payment', 'pending', 'in_production', 'ready', 'delivered', 'cancelled'];

// Human verbs for the state machine — the raw status names are for the API.
const ACTION = {
  pending: 'Confirm payment',
  in_production: 'Start work',
  ready: 'Mark ready',
  delivered: 'Deliver to buyer',
};
const actionLabel = (s) => ACTION[s] || s.replace(/_/g, ' ');

export default function ReelsPage() {
  const notify = useNotify();
  const [orders, setOrders] = useState(null);
  const [filter, setFilter] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [offset, setOffset] = useState(0);

  const load = () => { studio.get('/admin/reel-orders').then((r) => setOrders(r || [])).catch((e) => notify(e.message, true)); };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setOffset(0); }, [filter]);

  const counts = useMemo(() => {
    const c = {};
    for (const o of orders || []) c[o.status] = (c[o.status] || 0) + 1;
    return c;
  }, [orders]);

  const visible = (orders || []).filter((o) => !filter || o.status === filter);
  const safeOffset = Math.min(offset, Math.max(0, (Math.ceil(visible.length / LIMIT) - 1) * LIMIT));
  const pageOrders = visible.slice(safeOffset, safeOffset + LIMIT);
  const queue = (orders || []).filter((o) => ['pending', 'in_production', 'ready'].includes(o.status)).length;

  async function advance(o, to, extra = {}) {
    setBusyId(o.id);
    try {
      const u = await studio.patch(`/admin/reel-orders/${o.id}`, { status: to, ...extra });
      setOrders((xs) => (xs || []).map((x) => (x.id === o.id ? { ...x, ...(u.data || u), status: to } : x)));
      notify(to === 'cancelled' ? 'Order cancelled' : `Order → ${actionLabel(to).toLowerCase()}`);
    } catch (e) { notify(e.message, true); }
    setBusyId(null);
  }

  return (
    <StudioShell active="reels" kpis={{ reels: queue }}>
      <div className="st-filters" role="tablist" aria-label="Order status">
        <button className="st-btn-ghost" style={!filter ? { borderColor: '#fff' } : undefined} onClick={() => setFilter('')}>All ({(orders || []).length})</button>
        {ORDER.filter((s) => counts[s]).map((s) => (
          <button key={s} className="st-btn-ghost" style={filter === s ? { borderColor: '#fff' } : undefined} onClick={() => setFilter(filter === s ? '' : s)}>
            {actionLabel(s)} ({counts[s]})
          </button>
        ))}
      </div>
      {orders === null ? <p className="empty-note">Loading…</p> : !visible.length ? (
        <div className="event-media-empty">
          <p className="eyebrow">No pre-book orders</p>
          <h3>{filter ? 'Nothing in this state.' : 'The queue is empty.'}</h3>
          <Link href="/studio/pricing" style={{ paddingBottom: 5, borderBottom: '1px solid #666', fontSize: 12, color: '#bbb' }}>Check reel products are published</Link>
        </div>
      ) : (
        <div className="st-card" style={{ padding: '6px 22px' }}>
          <table className="st-table">
            <thead><tr><th>Order</th><th>Rider / horse</th><th>Event</th><th>Status</th><th>Payment</th><th></th></tr></thead>
            <tbody>
              {pageOrders.map((o) => (
                <OrderRow key={o.id} o={o} busy={busyId === o.id} onAdvance={advance} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager total={visible.length} limit={LIMIT} offset={safeOffset} onPage={setOffset} />
    </StudioShell>
  );
}

function OrderRow({ o, busy, onAdvance }) {
  const [confirmUI, dialog] = useConfirm();
  const [linking, setLinking] = useState(false);
  const [mediaId, setMediaId] = useState(o.media_id || '');
  const nexts = FLOW[o.status] || [];
  return (
    <tr>
      <td>
        <div style={{ fontWeight: 600 }}>{o.product_name}</div>
        <div style={{ color: '#777', fontSize: 11 }}>{o.horse_name || ''}{o.class_name ? ` · ${o.class_name}` : ''} · {dayOf(o.created_at)}</div>
      </td>
      <td>{[o.rider_name, o.horse_name].filter(Boolean).join(' / ') || '—'}</td>
      <td>{o.event_name || '—'}</td>
      <td><Chip status={o.status} /></td>
      <td><Chip status={o.payment_status || 'unknown'} /></td>
      <td style={{ whiteSpace: 'nowrap' }}>
        {nexts.filter((s) => s !== 'cancelled').map((s) => (
          s === 'ready' && !o.media_id && !linking ? (
            <button key={s} className="st-btn-ghost" style={{ minHeight: 36, marginRight: 8 }} disabled={busy} onClick={() => setLinking(true)}>Link reel…</button>
          ) : (
            <button key={s} className="st-btn-ghost" style={{ minHeight: 36, marginRight: 8 }} disabled={busy}
              onClick={() => onAdvance(o, s, s === 'ready' && mediaId ? { media_id: mediaId } : {})}>
              {busy ? '…' : actionLabel(s)}
            </button>
          )
        ))}
        {nexts.includes('cancelled') && (
          <>
            <button className="st-btn-ghost st-btn-danger" style={{ minHeight: 36 }} disabled={busy} onClick={async () => {
              const ok = await dialog.confirm({ title: 'Cancel this order?', message: 'The buyer is not refunded automatically — handle the refund in Stripe if needed.', confirmLabel: 'Cancel order', danger: true });
              if (ok) onAdvance(o, 'cancelled');
            }}>Cancel order</button>
            {confirmUI}
          </>
        )}
        {linking && (
          <span style={{ display: 'inline-flex', gap: 6, marginLeft: 4 }}>
            <input value={mediaId} onChange={(e) => setMediaId(e.target.value)} placeholder="Reel media UUID"
              style={{ height: 36, width: 220, background: '#0b0b0b', border: '1px solid #333', color: '#fff', fontSize: 12, padding: '0 8px' }} />
            <button className="st-btn" style={{ minHeight: 36 }} disabled={busy || !mediaId} onClick={() => { onAdvance(o, 'ready', { media_id: mediaId }); setLinking(false); }}>Save</button>
          </span>
        )}
      </td>
    </tr>
  );
}
