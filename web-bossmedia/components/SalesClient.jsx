'use client';
import { useEffect, useMemo, useState } from 'react';
import StudioShell, { Bars, Chip, Pager, Stat } from './studio';
import { useNotify } from './Toaster';
import SearchSelect from './SearchSelect';
import { API } from '../lib/api';
import { dayOf, nzdc, studio } from '../lib/studio';

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
    studio.get(`/admin/sales?${query}`)
      .then((j) => { setRows(j.data || []); setTotal(j.totals ? j.pagination.total : (j.data || []).length); })
      .catch((e) => notify(e.message, true));
  }, [query, notify]);

  useEffect(() => { studio.get('/admin/sales/summary').then(setSummary).catch(() => {}); }, []);

  const resetPage = (fn) => (v) => { setOffset(0); fn(v); };
  const k = summary?.kpis;
  const csvHref = `${API}/api/admin/sales.csv${status || kind || eventId ? `?${new URLSearchParams({ ...(status ? { status } : {}), ...(kind ? { kind } : {}), ...(eventId ? { event_id: eventId } : {}) })}` : ''}`;

  return (
    <StudioShell active="sales">
      <div className="st-kpis">
        <Stat label="Paid" value={k ? nzdc(k.gross_cents) : '—'} sub={k ? `${k.paid} sales · avg ${nzdc(k.avg_cents)}` : 'collected revenue'} />
        <Stat label="Pending" value={k ? nzdc(k.pending_cents) : '—'} sub={k ? `${k.pending} held at checkout` : 'awaiting payment'} />
        <Stat label="Refunded" value={k ? k.refunded : '—'} sub="reversed sales" />
        <Stat label="Stripe fees (est.)" value={summary ? nzdc((summary.settlement || []).reduce((s, x) => s + Number(x.stripe_fee_cents || 0), 0)) : '—'} sub="1.75% + 30¢ per sale" />
      </div>
      <div className="st-filters">
        <SearchSelect
          options={[{ id: '', label: 'All statuses' }, { id: 'paid', label: 'Paid' }, { id: 'pending', label: 'Pending' }, { id: 'refunded', label: 'Refunded' }]}
          value={status} onChange={(v) => resetPage(setStatus)(v || '')} placeholder="Status" />
        <SearchSelect
          options={[{ id: '', label: 'Photo + package + reel + credit' }, { id: 'photo', label: 'Photos' }, { id: 'package', label: 'Packages' }, { id: 'reel', label: 'Reels' }, { id: 'credit', label: 'Credits' }]}
          value={kind} onChange={(v) => resetPage(setKind)(v || '')} placeholder="Kind" />
        <SearchSelect
          options={[{ id: '', label: 'All events' }, ...events.map((e) => ({ id: e.id, label: e.name }))]}
          value={eventId} onChange={(v) => resetPage(setEventId)(v || '')} placeholder="Event" />
        <a className="st-btn-ghost" style={{ textDecoration: 'none', alignSelf: 'center' }} href={csvHref} download>Export CSV</a>
      </div>
      <div className="st-grid-2">
        <div className="st-card">
          <h3>Revenue by tier</h3>
          <p className="st-csub">Paid sales only</p>
          {(summary?.by_tier || []).length
            ? <Bars rows={summary.by_tier.map((t) => ({ label: t.tier, value: Number(t.gross_cents) }))} format={(r) => `${nzdc(r.value)} · ${summary.by_tier.find((t) => t.tier === r.label)?.sales || 0}`} />
            : <p className="empty-note">No paid sales yet.</p>}
        </div>
        <div className="st-card">
          <h3>Photographer payout</h3>
          <p className="st-csub">Gross − commission − Stripe fees</p>
          {(summary?.settlement || []).length ? (
            <div className="table-scroll"><table className="st-table">
              <thead><tr><th>Who</th><th>Gross</th><th>Payout</th></tr></thead>
              <tbody>
                {summary.settlement.map((s) => (
                  <tr key={s.photographer_id}>
                    <td>{s.photographer}<div style={{ color: '#777', fontSize: 11 }}>{s.sales} sales · {Math.round(Number(s.commission_rate) * 100)}% commission</div></td>
                    <td>{nzdc(s.gross_cents)}</td>
                    <td><b>{nzdc(s.payout_cents)}</b></td>
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
                <td style={{ whiteSpace: 'nowrap' }}>{dayOf(s.created_at)}</td>
                <td>{s.buyer_email || '—'}</td>
                <td>{[s.horse, s.rider].filter(Boolean).join(' · ') || s.package_title || s.event_name || s.kind || '—'}</td>
                <td>{s.license_tier || s.package_title || s.kind || '—'}</td>
                <td><b>{nzdc(s.amount_cents)}</b></td>
                <td><Chip status={s.status} /></td>
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
