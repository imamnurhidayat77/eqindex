'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import StudioShell, { Chip, Pager } from '../../../components/studio';
import { useNotify } from '../../../components/Toaster';
import { useConfirm } from '../../../components/ConfirmModal';
import { dayOf, nzdc, studio } from '../../../lib/studio';
import { useDocumentTitle } from '../../../lib/use-document-title';

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
  useDocumentTitle('Pre-book orders');
  const notify = useNotify();
  const [orders, setOrders] = useState(null);
  const [filter, setFilter] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [offset, setOffset] = useState(0);

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

  const setOrderMedia = (orderId, mediaId) =>
    setOrders((xs) => (xs || []).map((x) => (x.id === orderId ? { ...x, media_id: mediaId } : x)));

  return (
    <StudioShell active="reels" kpis={{ reels: queue }}>
      <div className="st-filters" role="group" aria-label="Order status">
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
          <div className="table-scroll"><table className="st-table">
            <thead><tr><th>Order</th><th>Rider / horse</th><th>Event</th><th>Status</th><th>Payment</th><th></th></tr></thead>
            <tbody>
              {pageOrders.map((o) => (
                <OrderRow key={o.id} o={o} busy={busyId === o.id} onAdvance={advance} onMediaLinked={setOrderMedia} />
              ))}
            </tbody>
          </table></div>
        </div>
      )}
      <Pager total={visible.length} limit={LIMIT} offset={safeOffset} onPage={setOffset} />
    </StudioShell>
  );
}

function OrderRow({ o, busy, onAdvance, onMediaLinked }) {
  const notify = useNotify();
  const [confirmUI, dialog] = useConfirm();
  const [linking, setLinking] = useState(null); // null | 'link' | 'change'
  const [mediaId, setMediaId] = useState(o.media_id || '');
  const [reels, setReels] = useState(null);
  const [picked, setPicked] = useState(null);
  const [saving, setSaving] = useState(false);
  const startLinking = (mode) => {
    setLinking(mode);
    setPicked(mode === 'change' ? (o.media_id || null) : null);
    setReels(null);
    studio.get('/admin/media?kind=reel&limit=100').then((r) => setReels(r || [])).catch((e) => notify(e.message, true));
  };
  async function savePicked() {
    if (!picked || saving) return;
    setSaving(true);
    try {
      if (linking === 'change') {
        await studio.patch(`/admin/reel-orders/${o.id}`, { media_id: picked });
        onMediaLinked(o.id, picked);
        notify('Reel updated');
      } else {
        await onAdvance(o, 'ready', { media_id: picked });
      }
      setLinking(null);
    } catch (e) { notify(e.message, true); }
    setSaving(false);
  }
  // Most relevant first: same event, then same horse.
  const sorted = (reels || []).slice().sort((a, b) =>
    ((b.event_name === o.event_name) - (a.event_name === o.event_name))
    || ((b.horse === o.horse_name) - (a.horse === o.horse_name)));
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
            <button key={s} className="st-btn-ghost" style={{ minHeight: 36, marginRight: 8 }} disabled={busy} onClick={() => startLinking('link')}>Link reel…</button>
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
        {o.media_id && o.status !== 'delivered' && (
          <button className="st-btn-ghost" style={{ minHeight: 36, marginRight: 8 }} disabled={busy} onClick={() => startLinking('change')}>Change…</button>
        )}
        {linking && (
          <div className="st-modal" role="dialog" aria-modal="true" aria-label="Choose the finished reel"
            onMouseDown={(e) => { if (e.target === e.currentTarget) setLinking(null); }}>
            <div className="st-modal-card st-modal-card-xwide" role="document">
              <p className="eyebrow">{linking === 'change' ? 'Swap linked reel' : 'Link finished reel'}</p>
              <h3>Which cut is {o.horse_name || 'this order'}?</h3>
              {reels === null ? <p className="empty-note">Loading reels…</p>
              : !sorted.length ? <p className="empty-note">No finished reels in the library yet.</p> : (
                <div className="reel-pick-grid">
                  {sorted.map((m) => (
                    <button type="button" key={m.id} className={`st-media-card reel-pick${picked === m.id ? ' sel' : ''}`}
                      onClick={() => setPicked(picked === m.id ? null : m.id)}
                      aria-label={`Pick reel ${[m.horse, m.rider].filter(Boolean).join(' · ') || 'untagged'}`}
                      aria-pressed={picked === m.id}>
                      {picked === m.id && <span className="reel-pick-check" aria-hidden="true">✓</span>}
                      {m.thumb_url || m.preview_url
                        ? <img src={m.thumb_url || m.preview_url} alt="" loading="lazy" />
                        : <span className="cover-fallback">No preview</span>}
                      <footer>
                        <strong>{[m.horse, m.rider].filter(Boolean).join(' · ') || m.other_people || 'Untagged'}</strong>
                        <span>{m.event_name || 'No event'}</span>
                      </footer>
                    </button>
                  ))}
                </div>
              )}
              <div className="st-modal-actions">
                <button type="button" className="st-btn-ghost" onClick={() => setLinking(null)}>Cancel</button>
                <button type="button" className="st-btn" disabled={!picked || saving} onClick={savePicked}>
                  {saving ? 'Saving…' : 'Use this reel'}
                </button>
              </div>
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}
