'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { nzdc, studio } from '../../../lib/studio';
import { useAuthed } from '../../../lib/use-authed';
import { Icon, SiteFooter, SiteHeader } from '../../../components/figma';
import SearchSelect from '../../../components/SearchSelect';
import ConfirmModal, { useConfirm } from '../../../components/ConfirmModal';
import { useDocumentTitle } from '../../../lib/use-document-title';

export default function VolunteersPage() {
  useDocumentTitle('Volunteers');
  const { user, loading } = useAuthed();
  const state = loading ? 'loading'
    : !user ? 'login'
    : (user.role === 'ORGANIZER' || user.role === 'ADMIN' ? 'ok' : 'denied');

  if (state === 'loading') {
    return <div className="studio-page"><main className="section-gutter st-hero"><p className="eyebrow">Volunteers</p><p style={{ color: '#777' }}>Loading…</p></main></div>;
  }
  if (state !== 'ok') {
    return (
      <div className="studio-page"><main className="section-gutter st-hero">
        <p className="eyebrow">Volunteers</p>
        <h1>{state === 'login' ? 'Sign in first.' : 'Not your dashboard.'}</h1>
        <p>{state === 'login'
          ? <>This page needs an organizer account. <Link href="/register/organizer">Apply here</Link>.</>
          : <>Signed in as {user?.email} — this needs an organizer account.</>}</p>
        {state === 'login' && <p style={{ marginTop: 20 }}><Link href="/login?next=/organizer/volunteers" className="st-btn">Sign in</Link></p>}
      </main></div>
    );
  }
  return (
    <div className="studio-page">
      <SiteHeader />
      <main className="section-gutter">
        <div className="st-hero">
          <p className="eyebrow">Boss Media · Organizer</p>
          <h1>Volunteers.</h1>
          <p>Share your event commission with the crew. Volunteer balance is spend-only — it buys photos, never cash.</p>
        </div>
        <VolunteersBody />
      </main>
      <SiteFooter />
    </div>
  );
}

function VolunteersBody() {
  const [events, setEvents] = useState(null);
  const [eventId, setEventId] = useState('');
  const [roster, setRoster] = useState(null);
  const [history, setHistory] = useState(null);
  const [email, setEmail] = useState('');
  const [volunteerId, setVolunteerId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [confirmUI, dialog] = useConfirm();

  useEffect(() => {
    studio.get('/api/organizer/events').then((r) => {
      setEvents(r || []);
      if ((r || []).length === 1) setEventId(r[0].id);
    }).catch((e) => setMsg({ err: true, text: e.message }));
    studio.get('/api/organizer/grants').then(setHistory).catch(() => setHistory([]));
  }, []);

  useEffect(() => {
    if (!eventId) { setRoster(null); return; }
    setRoster(null);
    studio.get(`/api/organizer/events/${eventId}/volunteers`)
      .then(setRoster).catch((e) => setMsg({ err: true, text: e.message }));
  }, [eventId]);

  const reload = () => {
    studio.get(`/api/organizer/events/${eventId}/volunteers`).then((r) => {
      setRoster(r || []); setVolunteerId('');
    }).catch((e) => setMsg({ err: true, text: e.message }));
    studio.get('/api/organizer/grants').then(setHistory).catch(() => {});
  };

  async function addVolunteer(e) {
    e.preventDefault();
    if (busy || !eventId) return;
    setBusy(true); setMsg(null);
    try {
      await studio.post(`/api/organizer/events/${eventId}/volunteers`, { email: email.trim() });
      setEmail('');
      setMsg({ text: 'Volunteer added to the roster.' });
      reload();
    } catch (err) { setMsg({ err: true, text: err.message }); }
    setBusy(false);
  }

  async function removeVolunteer(u) {
    const ok = await dialog.confirm({
      title: `Remove ${u.name || u.email} from the roster?`,
      message: 'Past grants stay in history — this only stops future ones.',
    });
    if (!ok) return;
    try {
      await studio.del(`/api/organizer/events/${eventId}/volunteers/${u.user_id}`);
      setMsg({ text: 'Removed from roster.' });
      reload();
    } catch (err) { setMsg({ err: true, text: err.message }); }
  }

  async function grant() {
    const cents = Math.round(Number(amount) * 100);
    const v = (roster || []).find((x) => x.user_id === volunteerId);
    if (!v || !Number.isInteger(cents) || cents < 1) { setMsg({ err: true, text: 'Pick a volunteer and enter at least NZ$1.' }); return; }
    const ok = await dialog.confirm({
      title: `Grant ${nzdc(cents)} to ${v.name} (${v.email})?`,
      message: 'Spend-only balance — it buys photos, never cash. This cannot be undone.',
      danger: true,
    });
    if (!ok) return;
    setBusy(true); setMsg(null);
    try {
      const r = await studio.post('/api/wallet/grant', {
        to_user_id: v.user_id, amount_cents: cents,
        reason: reason.trim() || undefined, event_id: eventId,
      });
      const g = r.data || r;
      setMsg({ text: `Granted ${nzdc(g.granted_cents)}. Your new balance ${nzdc(g.balance_cents)}.` });
      setVolunteerId(''); setAmount(''); setReason('');
      reload();
    } catch (err) { setMsg({ err: true, text: err.message }); }
    setBusy(false);
  }

  return (
    <>
      {confirmUI}
      {msg && <p className={msg.err ? 'auth-error' : 'empty-note'} role={msg.err ? 'alert' : undefined}>{msg.text}</p>}
      <div className="st-card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="st-form">
          <label><span>Event</span>
            <SearchSelect
              options={(events || []).map((ev) => ({ id: ev.id, label: ev.name }))}
              value={eventId || null}
              onChange={(id) => setEventId(id || '')}
              placeholder={events === null ? 'Loading events…' : 'Pick an event…'}
              clearable={false} />
          </label>
        </div>
      </div>
      {!eventId ? <p className="empty-note">Pick an event above to manage its crew.</p> : (
        <>
          <div className="st-card" style={{ padding: 18, marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 4px' }}>Roster</h3>
            <p className="st-csub">Only rostered volunteers can receive event grants.</p>
            <form className="st-form-row" style={{ gridTemplateColumns: '2fr 1fr auto', marginTop: 12 }} onSubmit={addVolunteer}>
              <label><span>Email</span>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="volunteer@example.nz" autoComplete="off" /></label>
              <span />
              <span style={{ alignSelf: 'end' }}><button className="st-btn-ghost" disabled={busy}>Add</button></span>
            </form>
            {roster === null ? <p className="empty-note">Loading roster…</p> : !roster.length ? (
              <p className="empty-note">Roster is empty — add the crew by email.</p>
            ) : (
              <table className="st-table" style={{ marginTop: 12 }}>
                <thead><tr><th>Volunteer</th><th style={{ textAlign: 'right' }}>Granted</th><th></th></tr></thead>
                <tbody>
                  {roster.map((v) => (
                    <tr key={v.user_id}>
                      <td><div style={{ fontWeight: 600 }}>{v.name || '—'}</div>
                        <div style={{ color: '#777', fontSize: 11 }}>{v.email}</div></td>
                      <td style={{ textAlign: 'right' }}>{nzdc(v.granted_cents || 0)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="st-btn-ghost" style={{ minHeight: 34 }} onClick={() => removeVolunteer(v)}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="st-card" style={{ padding: 18, marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 4px' }}>Grant balance</h3>
            <p className="st-csub">Spend-only credit from your commission. It buys photos, never cash.</p>
            <div className="st-form" style={{ marginTop: 12 }}>
              <label><span>Volunteer</span>
                <SearchSelect
                  options={(roster || []).map((v) => ({ id: v.user_id, label: `${v.name || v.email} · ${nzdc(v.granted_cents || 0)} so far` }))}
                  value={volunteerId || null}
                  onChange={(id) => setVolunteerId(id || '')}
                  placeholder={roster === null ? 'Loading…' : 'Pick from roster…'}
                  clearable={false} />
              </label>
              <div className="st-form-row">
                <label><span>Amount (NZ$)</span>
                  <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 25" /></label>
                <label><span>Note (optional)</span>
                  <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Gate crew, Saturday" maxLength={200} /></label>
              </div>
              <div><button className="st-btn" disabled={busy} onClick={grant}>{busy ? 'Granting…' : 'Grant balance'}</button></div>
            </div>
          </div>
          <div className="st-card" style={{ padding: '6px 22px' }}>
            <h3 style={{ margin: '18px 0 4px' }}>Grant history</h3>
            {history === null ? <p className="empty-note">Loading…</p> : !history.length ? (
              <p className="empty-note">No grants yet.</p>
            ) : (
              <table className="st-table">
                <thead><tr><th>To</th><th>Event</th><th style={{ textAlign: 'right' }}>Amount</th><th>Date</th></tr></thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={`${h.created_at}-${i}`}>
                      <td><div style={{ fontWeight: 600 }}>{h.name || '—'}</div>
                        <div style={{ color: '#777', fontSize: 11 }}>{[h.email, h.reason].filter(Boolean).join(' · ')}</div></td>
                      <td style={{ fontSize: 12 }}>{h.event_name || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{nzdc(h.amount_cents)}</td>
                      <td style={{ fontSize: 12 }}>{(h.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </>
  );
}
