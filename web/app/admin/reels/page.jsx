'use client';
import { useEffect, useState } from 'react';
import { CARD, H1, SUB, TABLE, TABLEWRAP, TD, TH, NUM, INP, BTN_PRIMARY } from '../../../lib/tokens';
import { useAdminApi } from '../../../components/useAdminApi';
import { TableRowsSk } from '../../../components/Skeletons';
import { RowBtn, StatusPill, FilterSelect, Count } from '../../../components/TableBits';

const nzd = (c) => (c === null || c === undefined ? '—' : `NZ$${(Number(c) / 100).toFixed(2)}`);
const MUSIC = { choose_for_me: 'Choose for me', title: 'Track requested', none: 'No music' };
const NEXT = {
  awaiting_payment: [],
  pending: ['in_production', 'cancelled'],
  in_production: ['ready', 'cancelled'],
  ready: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

// Reel order fulfillment queue: paid orders flow pending -> in_production ->
// ready (finished reel media linked) -> delivered. Payment is enforced by the
// API before production steps; deleting is not offered (cancel instead).
export default function AdminReels() {
  const call = useAdminApi();
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('');
  const [mediaEdits, setMediaEdits] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load(st) {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (st || status) p.set('status', st || status);
      const d = await call(`/admin/reel-orders?${p}`);
      setRows(d || []);
    } catch (e) { setMsg(e.message); }
    setLoading(false);
  }
  useEffect(() => { load(''); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function move(o, to) {
    const body = { status: to };
    if (to === 'ready') {
      const mid = (mediaEdits[o.id] || '').trim();
      if (!mid && !o.media_id) { setMsg('Paste the finished reel media ID first.'); return; }
      if (mid) body.media_id = mid;
    }
    setBusy(true);
    try {
      await call(`/admin/reel-orders/${o.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setMsg(`Order ${o.horse_name} → ${to}.`);
      load();
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  }

  async function toggleShowcase(o) {
    // Consent flag — only flip with the buyer's permission.
    if (!window.confirm(`${o.showcase ? 'Remove' : 'Allow'} "${o.product_name} — ${o.horse_name}" ${o.showcase ? 'from' : 'in'} public galleries? Only with buyer consent.`)) return;
    setBusy(true);
    try {
      await call(`/admin/reel-orders/${o.id}`, { method: 'PATCH', body: JSON.stringify({ showcase: !o.showcase }) });
      setMsg(`Showcase ${!o.showcase ? 'allowed' : 'revoked'} for ${o.horse_name}.`);
      load();
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  }

  return (
    <>
      <h1 className={H1}>Reel Orders</h1>
      <p className={SUB}>Request-based fulfillment: paid orders are produced, linked to the finished reel, then delivered.</p>
      {msg && <section className={CARD} role="alert"><p className="text-sm text-gold">{msg}</p></section>}

      <section className={CARD}>
        <div className="flex items-center gap-2 mb-3">
          <label className="flex items-center gap-2 text-[12px] text-faint">Status
            <FilterSelect ariaLabel="Filter by status" value={status}
              onChange={(v) => { setStatus(v); load(v); }}
              options={[{ value: '', label: 'All' }, ...Object.keys(NEXT).map((s) => ({ value: s, label: s.replace(/_/g, ' ') }))]} />
          </label>
          <span className="flex-1" />
          <span className="text-[12px] text-faint"><Count n={rows.length} one="order" /></span>
        </div>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr>
            <th className={TH}>Date</th><th className={TH}>Product / Event</th><th className={TH}>Shoot</th>
            <th className={TH}>Music</th><th className={TH}>Buyer</th>
            <th className={`${TH} ${NUM}`}>Price</th><th className={TH}>Pay</th><th className={TH}>Status</th>
            <th className={TH}><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="border-b border-rowline last:border-0 align-top">
                <td className={`${TD} text-[12px] whitespace-nowrap`}>{(o.created_at || '').slice(0, 10)}</td>
                <td className={TD}><div className="text-[13px] font-bold">{o.product_name}</div>
                  <div className="text-[12px] text-faint">{o.event_name || '—'}</div></td>
                <td className={TD}><div className="text-[13px]">{o.horse_name}</div>
                  <div className="text-[12px] text-faint">{[o.class_name, o.back_number && `#${o.back_number}`, o.ring, o.shooting_date?.slice(0, 10)].filter(Boolean).join(' · ') || '—'}</div>
                  {o.phone && <div className="text-[12px] text-faint">{o.phone}</div>}</td>
                <td className={TD}><div className="text-[12.5px]">{MUSIC[o.music_mode] || o.music_mode}</div>
                  {o.music_mode === 'title' && <div className="text-[12px] text-gold">“{o.music_title}”</div>}</td>
                <td className={`${TD} text-[12px]`}>{o.buyer_email}</td>
                <td className={`${TD} ${NUM}`}>{nzd(o.price_cents)}</td>
                <td className={TD}><StatusPill value={o.payment_status} /></td>
                <td className={TD}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusPill value={o.status} />
                    {o.media_id && <span className="font-mono text-[10.5px] text-faint">{o.media_id.slice(0, 8)}…</span>}
                  </div>
                  <div className="mt-1.5">
                    <RowBtn onClick={() => toggleShowcase(o)} disabled={busy} title="Public showcase needs buyer consent"
                      tone={o.showcase ? 'gold' : 'muted'}>
                      {o.showcase ? '★ Showcase' : '☆ Private'}
                    </RowBtn>
                  </div></td>
                <td className={`${TD} whitespace-nowrap text-right`}>
                  {(NEXT[o.status] || []).includes('ready') && (
                    <input value={mediaEdits[o.id] ?? ''} onChange={(e) => setMediaEdits((p) => ({ ...p, [o.id]: e.target.value }))}
                      placeholder="reel media id" className={INP} style={{ width: 130, marginRight: 6 }} />
                  )}
                  <span className="inline-flex flex-wrap justify-end gap-1.5">
                    {(NEXT[o.status] || []).map((nx) => (
                      <RowBtn key={nx} onClick={() => move(o, nx)} disabled={busy}
                        tone={nx === 'cancelled' ? 'danger' : 'sky'}>
                        → {nx.replace(/_/g, ' ')}
                      </RowBtn>
                    ))}
                  </span>
                  {!(NEXT[o.status] || []).length && <span className="text-[12px] text-faint">—</span>}
                </td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr><td colSpan={9} className="px-2 py-4 text-[13px] text-faint">No reel orders in this view yet.</td></tr>
            )}
            {loading && <TableRowsSk rows={5} />}
          </tbody>
        </table>
        </div>
      </section>
    </>
  );
}
