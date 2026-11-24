'use client';
// Admin > Sponsors: pre-agreed budgets billed to the sponsor afterwards.
// Admin sets the agreed amount; the sponsor only sets the per-photo
// discount (capped at 50% of the price by the API). Bills collect every
// unbilled discount + gift; the invoice itself comes from accounting.
import { useCallback, useEffect, useState } from 'react';
import { useNotify } from './Toaster';
import { useConfirm } from './ConfirmModal';
import SearchSelect from './SearchSelect';
import { API } from '../lib/api';
import { nzdc, studio } from '../lib/studio';
import { fmtDay } from '../lib/studio-format.mjs';

const STATUS_LABEL = { active: 'Active', paused: 'Paused', closed: 'Closed' };
const KIND_LABEL = { photo: 'Photos', merch: 'Merchandise' };
const dollarsToCents = (v) => Math.round(Number(String(v).replace(/[^0-9.]/g, '')) * 100);

export default function AdminSponsors() {
  const notify = useNotify();
  const [sponsors, setSponsors] = useState(null);
  const [sel, setSel] = useState('');
  useEffect(() => {
    studio.get('/admin/sponsors').then((rows) => {
      setSponsors(rows || []);
      if (rows?.length) setSel((s) => s || rows[0].id);
    }).catch((e) => notify(e.message, true));
  }, [notify]);
  if (sponsors === null) return <p className="empty-note">Loading…</p>;
  if (!sponsors.length) {
    return <p className="empty-note">No sponsors yet. Approve a sponsor application under Requests first.</p>;
  }
  return (
    <>
      <div className="st-form" style={{ maxWidth: 420, marginBottom: 16 }}>
        <label><span>Sponsor</span>
          <SearchSelect value={sel} clearable={false} placeholder="Choose a sponsor"
            options={sponsors.map((s) => ({ id: s.id, label: `${s.name}${s.is_active ? '' : ' (inactive)'}` }))}
            onChange={setSel} />
        </label>
      </div>
      {sel && <SponsorBudgets key={sel} sponsor={sponsors.find((s) => s.id === sel)} />}
    </>
  );
}

function SponsorBudgets({ sponsor }) {
  const notify = useNotify();
  const [confirmUI, dialog] = useConfirm();
  const [rows, setRows] = useState(null);
  const [billsFor, setBillsFor] = useState(null);
  const load = useCallback(() => {
    studio.get(`/admin/sponsors/${sponsor.id}/budgets`).then(setRows).catch((e) => notify(e.message, true));
  }, [sponsor.id, notify]);
  useEffect(() => { load(); }, [load]);

  async function patch(b, body, msg) {
    try { await studio.patch(`/admin/sponsor-budgets/${b.id}`, body); notify(msg); load(); }
    catch (e) { notify(e.message, true); }
  }
  async function editAmount(b) {
    const v = await dialog.prompt({
      title: 'Agreed amount (NZ$)', initial: String(Number(b.agreed_cents) / 100),
      placeholder: 'e.g. 2000', confirmLabel: 'Save',
    });
    if (v === null) return;
    const cents = dollarsToCents(v);
    if (!(cents > 0)) { notify('Enter an amount above NZ$0.', true); return; }
    patch(b, { agreed_cents: cents }, 'Agreed amount updated');
  }
  async function bill(b) {
    if (!(Number(b.unbilled_cents) > 0)) { notify('Nothing to bill yet.', true); return; }
    const ref = await dialog.prompt({
      title: `Bill ${nzdc(b.unbilled_cents)} to ${sponsor.name}?`,
      placeholder: 'Invoice number from accounting (optional)', confirmLabel: 'Create bill',
    });
    if (ref === null) return;
    try {
      await studio.post(`/admin/sponsor-budgets/${b.id}/bills`, { reference: ref || undefined });
      notify('Bill created. Send the invoice from accounting.');
      load(); setBillsFor(b.id);
    } catch (e) { notify(e.message, true); }
  }

  return (
    <>
      <NewBudgetForm sponsorId={sponsor.id} onCreated={load} />
      {rows === null ? <p className="empty-note">Loading…</p> : !rows.length ? (
        <p className="empty-note">No budgets for {sponsor.name} yet.</p>
      ) : (
        <div className="st-card" style={{ padding: '6px 22px' }}>
          <div className="table-scroll"><table className="st-table">
            <thead><tr><th>Type</th><th>Event</th><th>Agreed</th><th>Spent</th><th>Unbilled</th><th>Discount</th><th>Ends</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td>{KIND_LABEL[b.applies_to] || b.applies_to}</td>
                  <td>{b.event_name || 'Any event'}{b.note && <div style={{ color: '#9a9a9a', fontSize: 11 }}>{b.note}</div>}</td>
                  <td>{nzdc(b.agreed_cents)}</td>
                  <td>{nzdc(b.spent_cents)}</td>
                  <td>{nzdc(b.unbilled_cents)}</td>
                  <td>{Number(b.discount_cents) > 0 ? `${nzdc(b.discount_cents)}/${b.applies_to === 'merch' ? 'item' : 'photo'}` : 'Not set'}</td>
                  <td>{b.ends_on ? fmtDay(b.ends_on) : '—'}</td>
                  <td>{STATUS_LABEL[b.status] || b.status}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="st-btn-ghost" style={{ minHeight: 36 }} onClick={() => editAmount(b)}>Edit amount</button>{' '}
                    {b.status === 'active' && <button className="st-btn-ghost" style={{ minHeight: 36 }} onClick={() => patch(b, { status: 'paused' }, 'Budget paused: discounts are off')}>Pause</button>}
                    {b.status === 'paused' && <button className="st-btn-ghost" style={{ minHeight: 36 }} onClick={() => patch(b, { status: 'active' }, 'Budget resumed')}>Resume</button>}{' '}
                    <button className="st-btn" style={{ minHeight: 36 }} onClick={() => bill(b)}>Bill now</button>{' '}
                    <button className="st-btn-ghost" style={{ minHeight: 36 }} onClick={() => setBillsFor(billsFor === b.id ? null : b.id)}>Bills</button>{' '}
                    <a className="st-btn-ghost" style={{ minHeight: 36, display: 'inline-flex', alignItems: 'center' }}
                      href={`${API}/admin/sponsor-budgets/${b.id}/usage?format=csv`}>CSV</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <p style={{ color: '#777', fontSize: 12, padding: '0 0 12px' }}>
            Boss Media pays photographers in full at sale time and bills the sponsor afterwards. Pause a budget to switch its discount off at once.
          </p>
        </div>
      )}
      {billsFor && <Bills budgetId={billsFor} />}
      {confirmUI}
    </>
  );
}

function NewBudgetForm({ sponsorId, onCreated }) {
  const notify = useNotify();
  const [events, setEvents] = useState([]);
  const [kind, setKind] = useState('photo');
  const [amount, setAmount] = useState('');
  const [eventId, setEventId] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { studio.get('/admin/events').then((r) => setEvents(r || [])).catch(() => {}); }, []);
  async function create() {
    const cents = dollarsToCents(amount);
    if (!(cents > 0)) { notify('Enter the agreed amount in NZ$.', true); return; }
    setBusy(true);
    try {
      await studio.post(`/admin/sponsors/${sponsorId}/budgets`, {
        agreed_cents: cents, applies_to: kind, event_id: eventId || null, ends_on: endsOn || null, note: note || undefined,
      });
      setAmount(''); setEventId(''); setEndsOn(''); setNote('');
      notify('Budget created. The sponsor can now set a discount.');
      onCreated();
    } catch (e) { notify(e.message, true); } finally { setBusy(false); }
  }
  return (
    <div className="st-card" style={{ padding: 18, marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 4px' }}>New pre-agreed budget</h3>
      <p className="st-csub" style={{ margin: '0 0 12px' }}>The amount agreed with the sponsor. Usage is billed to them afterwards.</p>
      <div className="st-form">
        <label><span>Discounts on</span>
          <SearchSelect value={kind} clearable={false}
            options={[{ id: 'photo', label: 'Photos' }, { id: 'merch', label: 'Merchandise' }]}
            onChange={(id) => setKind(id || 'photo')} /></label>
        <label><span>Agreed amount (NZ$)</span>
          <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 2000" /></label>
        <label><span>Event</span>
          <SearchSelect value={eventId} placeholder="Any event"
            options={[{ id: '', label: 'Any event' }, ...events.map((e) => ({ id: e.id, label: `${e.name} · ${String(e.date_start || '').slice(0, 10)}` }))]}
            onChange={(id) => setEventId(id || '')} /></label>
        <label><span>Ends on (optional)</span>
          <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} /></label>
        <label><span>Note (optional)</span>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Agreement signed 24 Nov" maxLength={300} /></label>
        <div><button className="st-btn" disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create budget'}</button></div>
      </div>
    </div>
  );
}

function Bills({ budgetId }) {
  const notify = useNotify();
  const [rows, setRows] = useState(null);
  const load = useCallback(() => {
    studio.get(`/admin/sponsor-bills?budget_id=${budgetId}`).then(setRows).catch((e) => notify(e.message, true));
  }, [budgetId, notify]);
  useEffect(() => { load(); }, [load]);
  async function markPaid(b) {
    try { await studio.patch(`/admin/sponsor-bills/${b.id}`, { status: 'paid' }); notify('Marked as paid'); load(); }
    catch (e) { notify(e.message, true); }
  }
  return (
    <div className="st-card" style={{ padding: '6px 22px', marginTop: 16 }}>
      <h3 style={{ margin: '12px 0 4px' }}>Bills</h3>
      {rows === null ? <p className="empty-note">Loading…</p> : !rows.length ? <p className="empty-note">No bills yet.</p> : (
        <div className="table-scroll"><table className="st-table">
          <thead><tr><th>Created</th><th>Period</th><th>Items</th><th>Amount</th><th>Reference</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td>{fmtDay(b.created_at)}</td>
                <td>{fmtDay(b.period_from)} → {fmtDay(b.period_to)}</td>
                <td>{b.items}</td>
                <td>{nzdc(b.amount_cents)}</td>
                <td>{b.reference || '—'}</td>
                <td>{b.status === 'paid' ? `Paid ${fmtDay(b.paid_at)}` : 'Billed'}</td>
                <td style={{ textAlign: 'right' }}>
                  {b.status === 'billed' && <button className="st-btn-ghost" style={{ minHeight: 36 }} onClick={() => markPaid(b)}>Mark paid</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}
