'use client';
import { useEffect, useMemo, useState } from 'react';
import StudioShell, { Bars, Chip, Pager, Stat } from './studio';
import { useNotify } from './Toaster';
import SearchSelect from './SearchSelect';
import styles from './Studio.module.css';
import { API } from '../lib/api';
import { studio, studioFetch } from '../lib/studio';
import { fmtDay, isAbandoned, nzdc, payoutBreakdown, tierLabel } from '../lib/studio-format.mjs';

const LIMIT = 25;

export default function SalesPage({ events, initialStatus }) {
  const notify = useNotify();
  const [status, setStatus] = useState(initialStatus || '');
  const [kind, setKind] = useState('');
  const [eventId, setEventId] = useState('');
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(null);

  const query = useMemo(() => {
    const p = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
    if (status) p.set('status', status);
    if (kind) p.set('kind', kind);
    if (eventId) p.set('event_id', eventId);
    return p.toString();
  }, [status, kind, eventId, offset]);

  useEffect(() => {
    studioFetch(`/admin/sales?${query}`)
      .then((j) => { setRows(j.data || []); setTotal(j.pagination ? j.pagination.total : (j.data || []).length); })
      .catch((e) => notify(e.message, true));
  }, [query, notify]);

  useEffect(() => { studio.get('/admin/sales/summary').then(setSummary).catch(() => {}); }, []);

  const resetPage = (fn) => (v) => { setOffset(0); fn(v); };
  const k = summary?.kpis;
  const payouts = (summary?.settlement || []).map((x) => ({ ...x, ...payoutBreakdown(x) }));
  const csvHref = `${API}/admin/sales.csv${status || kind || eventId ? `?${new URLSearchParams({ ...(status ? { status } : {}), ...(kind ? { kind } : {}), ...(eventId ? { event_id: eventId } : {}) })}` : ''}`;

  return (
    <StudioShell active="sales">
      <div className="st-kpis">
        <Stat label="Paid" value={k ? nzdc(k.gross_cents) : '—'} sub={k ? `${k.paid} sales · avg ${nzdc(k.avg_cents)}` : 'collected revenue'} />
        <Stat label="Payout" value={summary ? nzdc(payouts.reduce((s, x) => s + x.payout, 0)) : '—'} sub="after platform, organizer and card fees" />
        <Stat label="Checkouts in progress" value={k ? nzdc(k.open_checkout_cents) : '—'} sub={k ? `${k.open_checkouts} started in the last 24 hours · ${k.pending - k.open_checkouts} abandoned` : 'last 24 hours'} />
        <Stat label="Refunded" value={k ? k.refunded : '—'} sub="reversed sales" />
      </div>
      <div className="st-filters">
        <SearchSelect
          options={[{ id: '', label: 'All statuses' }, { id: 'paid', label: 'Paid' }, { id: 'pending', label: 'Pending' }, { id: 'refunded', label: 'Refunded' }]}
          value={status} onChange={(v) => resetPage(setStatus)(v || '')} placeholder="Status" />
        <SearchSelect
          options={[{ id: '', label: 'All types' }, { id: 'photo', label: 'Photos' }, { id: 'package', label: 'Packages' }, { id: 'reel', label: 'Reels' }, { id: 'credit', label: 'Credits' }]}
          value={kind} onChange={(v) => resetPage(setKind)(v || '')} placeholder="Kind" />
        <SearchSelect
          options={[{ id: '', label: 'All events' }, ...events.map((e) => ({ id: e.id, label: e.name }))]}
          value={eventId} onChange={(v) => resetPage(setEventId)(v || '')} placeholder="Event" />
        <a className="st-btn-ghost" style={{ textDecoration: 'none', alignSelf: 'center' }} href={csvHref} download>Export CSV</a>
      </div>
      <div className={`st-grid-2 ${styles.salesGrid}`}>
        <div className="st-card">
          <h3>Revenue by licence</h3>
          <p className="st-csub">Paid sales only</p>
          {(summary?.by_tier || []).length
            ? <Bars rows={summary.by_tier.map((t) => ({ label: tierLabel(t.tier), value: Number(t.gross_cents), sales: Number(t.sales) || 0 }))} format={(r) => `${nzdc(r.value)} · ${r.sales} ${r.sales === 1 ? 'sale' : 'sales'}`} />
            : <p className="empty-note">No paid sales yet.</p>}
        </div>
        <div className="st-card">
          <h3>Payout</h3>
          <p className="st-csub">Gross − platform fee − organizer share − card fees = payout</p>
          {payouts.length ? (
            <div className="table-scroll"><table className="st-table">
              <thead><tr><th>Who</th><th>Gross</th><th>Platform</th><th>Organizer</th><th>Card fees</th><th>Payout</th></tr></thead>
              <tbody>
                {payouts.map((x) => (
                  <tr key={x.photographer_id}>
                    <td>{x.photographer}<div style={{ color: '#9a9a9a', fontSize: 11 }}>{x.sales} {x.sales === 1 ? 'sale' : 'sales'}{x.gross ? ` · ${Math.round((x.fee / x.gross) * 1000) / 10}% platform` : ''}</div></td>
                    <td>{nzdc(x.gross)}</td>
                    <td>{nzdc(x.fee)}</td>
                    <td>{nzdc(x.organizer)}</td>
                    <td>{nzdc(x.cardFees)}</td>
                    <td><b>{nzdc(x.payout)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : <p className="empty-note">No settlement data yet.</p>}
        </div>
      </div>
      <div className="st-card" style={{ marginTop: 18, padding: '6px 22px' }}>
        <div className="table-scroll"><table className="st-table">
          <thead><tr><th>Date</th><th>Buyer</th><th>Item</th><th>Tier</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>
            {(rows || []).map((s) => (
              <tr key={s.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDay(s.created_at)}</td>
                <td>{s.buyer_email || '—'}</td>
                <td>{[s.horse, s.rider].filter(Boolean).join(' · ') || s.package_title || s.event_name || (s.kind === 'reel' ? 'Untagged reel' : 'Untagged photo')}</td>
                <td>{tierLabel(s.license_tier || s.kind)}</td>
                <td><b>{nzdc(s.amount_cents)}</b></td>
                <td><Chip status={isAbandoned(s) ? 'abandoned' : s.status} /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {!rows?.length && <p className="empty-note" style={{ padding: '18px 0' }}>{rows === null ? 'Loading…' : 'No sales match these filters.'}</p>}
        <Pager total={total} limit={LIMIT} offset={offset} onPage={setOffset} />
        <div style={{ height: 12 }} />
      </div>
    </StudioShell>
  );
}
