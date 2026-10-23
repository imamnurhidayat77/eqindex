'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { nzdc, studio } from '../../lib/studio';
import { Icon } from '../../components/figma';

const TABS = [['events', 'My events'], ['balance', 'Balance'], ['volunteers', 'Volunteers']];

export default function OrganizerPage() {
  const [user, setUser] = useState(null);
  const [state, setState] = useState('loading');
  const [tab, setTab] = useState('events');

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) return setState('login');
        const j = await r.json().catch(() => ({}));
        const u = j?.data;
        if (!u) return setState('login');
        setUser(u);
        setState(u.role === 'ORGANIZER' || u.role === 'ADMIN' ? 'ok' : 'denied');
      })
      .catch(() => setState('login'));
  }, []);

  if (state === 'loading') {
    return <div className="studio-page"><main className="section-gutter st-hero"><p className="eyebrow">Organizers</p><p style={{ color: '#777' }}>Loading…</p></main></div>;
  }
  if (state === 'login') {
    return (
      <div className="studio-page"><main className="section-gutter st-hero">
        <p className="eyebrow">Organizers</p><h1>Sign in first.</h1>
        <p>This dashboard needs an organizer account. <Link href="/register/organizer">Apply here</Link>.</p>
        <p style={{ marginTop: 20 }}><Link href="/login?next=/organizer" className="st-btn">Sign in</Link></p>
      </main></div>
    );
  }
  if (state === 'denied') {
    return (
      <div className="studio-page"><main className="section-gutter st-hero">
        <p className="eyebrow">Organizers</p><h1>Not your dashboard.</h1>
        <p>Signed in as {user?.email} — this needs an organizer account. <Link href="/register/organizer">Apply here</Link>.</p>
      </main></div>
    );
  }

  return (
    <div className="studio-page">
      <header className="header">
        <Link href="/" className="wordmark" aria-label="Boss Media home">BOSS<span>MEDIA</span></Link>
        <div className="header-actions">
          <Link href="/organizer" className="signin">{user?.name?.split(' ')[0] || 'Organizer'}</Link>
        </div>
      </header>
      <main className="section-gutter">
        <div className="st-hero">
          <p className="eyebrow">Boss Media · Organizer</p>
          <h1>My events.</h1>
          <p>Kia ora, {user?.name?.split(' ')[0] || 'organizer'} — run the show, earn on every photo.</p>
          <nav className="st-tabs" aria-label="Organizer sections">
            {TABS.map(([key, label]) => (
              <button key={key} type="button" className={tab === key ? 'active' : undefined}
                style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </nav>
        </div>
        {tab === 'events' && <EventsTab />}
        {tab === 'balance' && <BalanceTab />}
        {tab === 'volunteers' && <VolunteersTab />}
      </main>
      <footer className="footer section-gutter" style={{ borderTop: '1px solid #242424' }}>
        <div className="footer-bottom" style={{ borderTop: 0, marginTop: 0 }}>
          <p>© 2026 Boss Media Limited</p>
        </div>
      </footer>
    </div>
  );
}

function Note({ msg }) {
  if (!msg) return null;
  return <p className={msg.err ? 'auth-error' : 'empty-note'} role={msg.err ? 'alert' : undefined}>{msg.text}</p>;
}

/* ---------------- events: list + create + edit (own organization only) ---------------- */
const EMPTY_EVENT = { name: '', venue: '', region: '', date_start: '', date_end: '', arena_type: '', description: '' };
function EventsTab() {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(EMPTY_EVENT);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = () => studio.get('/api/organizer/events').then(setRows).catch((e) => setMsg({ err: true, text: e.message }));
  useEffect(load, []);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function create(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      await studio.post('/api/organizer/events', form);
      setForm(EMPTY_EVENT);
      setMsg({ text: 'Event created.' });
      load();
    } catch (err) { setMsg({ err: true, text: err.message }); }
    setBusy(false);
  }

  async function save(id) {
    if (busy || !editing) return;
    setBusy(true); setMsg(null);
    try {
      const updated = await studio.patch(`/api/organizer/events/${id}`, editing);
      setRows((xs) => (xs || []).map((x) => (x.id === id ? updated : x)));
      setEditing(null);
      setMsg({ text: 'Event updated.' });
    } catch (err) { setMsg({ err: true, text: err.message }); }
    setBusy(false);
  }

  if (rows === null) return <p className="empty-note">Loading…</p>;
  return (
    <>
      <Note msg={msg} />
      <div className="st-card" style={{ padding: 18, marginBottom: 16 }}>
        <form className="st-form" onSubmit={create}>
          <div className="st-form-row">
            <label><span>Event name</span>
              <input type="text" required value={form.name} onChange={(e) => set('name')(e.target.value)} placeholder="e.g. Brookby Show Jumping" /></label>
            <label><span>Venue</span>
              <input type="text" required value={form.venue} onChange={(e) => set('venue')(e.target.value)} placeholder="e.g. Brookby Equestrian" /></label>
          </div>
          <div className="st-form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <label><span>Region</span>
              <input type="text" value={form.region} onChange={(e) => set('region')(e.target.value)} placeholder="e.g. Auckland" /></label>
            <label><span>Start date</span>
              <input type="date" required value={form.date_start} onChange={(e) => set('date_start')(e.target.value)} /></label>
            <label><span>End date</span>
              <input type="date" required value={form.date_end} onChange={(e) => set('date_end')(e.target.value)} /></label>
          </div>
          <label><span>Description (optional)</span>
            <input type="text" value={form.description} onChange={(e) => set('description')(e.target.value)} placeholder="Anything riders should know" /></label>
          <div><button className="st-btn" disabled={busy}>{busy ? 'Creating…' : 'Create event'}</button></div>
        </form>
      </div>
      {!rows.length ? <p className="empty-note">No events yet — create your first above.</p> : (
        <div className="st-card" style={{ padding: '6px 22px' }}>
          <table className="st-table">
            <thead><tr><th>Event</th><th>Dates</th><th>Photos</th><th>Gross</th><th></th></tr></thead>
            <tbody>
              {rows.map((ev) => (
                <tr key={ev.id}>
                  <td><div style={{ fontWeight: 600 }}>{ev.name}</div>
                    <div style={{ color: '#777', fontSize: 11 }}>{[ev.venue, ev.region].filter(Boolean).join(' · ')}</div></td>
                  <td style={{ fontSize: 12 }}>{(ev.date_start || '').slice(0, 10)} → {(ev.date_end || '').slice(0, 10)}</td>
                  <td>{ev.photo_count ?? '—'}</td>
                  <td>{ev.gross_cents != null ? nzdc(ev.gross_cents) : '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="st-btn-ghost" style={{ minHeight: 36 }} onClick={() => setEditing(editing?.id === ev.id ? null : {
                      id: ev.id, name: ev.name || '', venue: ev.venue || '', region: ev.region || '',
                      date_start: (ev.date_start || '').slice(0, 10), date_end: (ev.date_end || '').slice(0, 10),
                      arena_type: ev.arena_type || '', description: ev.description || '',
                    })}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <div className="st-card" style={{ padding: 18, marginTop: 16 }}>
          <form className="st-form" onSubmit={(e) => { e.preventDefault(); save(editing.id); }}>
            <div className="st-form-row">
              <label><span>Event name</span>
                <input type="text" required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
              <label><span>Venue</span>
                <input type="text" required value={editing.venue} onChange={(e) => setEditing({ ...editing, venue: e.target.value })} /></label>
            </div>
            <div className="st-form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <label><span>Region</span>
                <input type="text" value={editing.region} onChange={(e) => setEditing({ ...editing, region: e.target.value })} /></label>
              <label><span>Start date</span>
                <input type="date" value={editing.date_start} onChange={(e) => setEditing({ ...editing, date_start: e.target.value })} /></label>
              <label><span>End date</span>
                <input type="date" value={editing.date_end} onChange={(e) => setEditing({ ...editing, date_end: e.target.value })} /></label>
            </div>
            <label><span>Description</span>
              <input type="text" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="st-btn" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
              <button type="button" className="st-btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

/* ---------------- balance: organizer share ledger ---------------- */
function BalanceTab() {
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    studio.get('/api/my/wallet').then(setData).catch((e) => setMsg({ err: true, text: e.message }));
  }, []);
  if (!data && !msg) return <p className="empty-note">Loading…</p>;
  return (
    <>
      <Note msg={msg} />
      {data && (
        <>
          <div className="st-card" style={{ padding: 18, marginBottom: 16 }}>
            <p className="st-klabel">Available balance</p>
            <strong className="st-kval">{nzdc(data.balance_cents)}</strong>
            <p><small style={{ color: '#777' }}>10% of every photo sale at your events lands here automatically.</small></p>
          </div>
          <div className="st-card" style={{ padding: '6px 22px' }}>
            <table className="st-table">
              <thead><tr><th>Type</th><th>Amount</th><th>Note</th><th>Date</th></tr></thead>
              <tbody>
                {(data.transactions || []).map((t, i) => (
                  <tr key={i}>
                    <td>{String(t.kind).replace(/_/g, ' ')}</td>
                    <td style={{ color: Number(t.amount_cents) < 0 ? '#e08a8a' : undefined }}>
                      {Number(t.amount_cents) < 0 ? '−' : '+'}{nzdc(Math.abs(Number(t.amount_cents)))}
                    </td>
                    <td style={{ fontSize: 12 }}>{t.reason || '—'}</td>
                    <td style={{ fontSize: 12 }}>{(t.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!(data.transactions || []).length && <p className="empty-note">No movements yet.</p>}
          </div>
        </>
      )}
    </>
  );
}

/* ---------------- volunteers: look up by email, grant balance ---------------- */
function VolunteersTab() {
  const [email, setEmail] = useState('');
  const [found, setFound] = useState(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function lookup(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg(null); setFound(null);
    try {
      const u = await studio.get(`/api/organizer/lookup?email=${encodeURIComponent(email.trim())}`);
      setFound(u);
    } catch (err) { setMsg({ err: true, text: err.message }); }
    setBusy(false);
  }

  async function grant() {
    const cents = Math.round(Number(amount) * 100);
    if (!found || !Number.isInteger(cents) || cents < 1) { setMsg({ err: true, text: 'Enter an amount of at least NZ$1.' }); return; }
    if (!window.confirm(`Grant ${nzdc(cents)} to ${found.name} (${found.email})? This cannot be undone.`)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await studio.post('/api/wallet/grant', { to_user_id: found.id, amount_cents: cents, reason: reason.trim() || undefined });
      setMsg({ text: `Granted ${nzdc(r.granted_cents)}. New balance ${nzdc(r.balance_cents)}.` });
      setFound(null); setEmail(''); setAmount(''); setReason('');
    } catch (err) { setMsg({ err: true, text: err.message }); }
    setBusy(false);
  }

  return (
    <>
      <Note msg={msg} />
      <div className="st-card" style={{ padding: 18, marginBottom: 16 }}>
        <form className="st-form" onSubmit={lookup}>
          <label><span>Volunteer email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="volunteer@example.nz" autoComplete="off" /></label>
          <div><button className="st-btn-ghost" disabled={busy}>{busy ? 'Looking up…' : 'Find volunteer'}</button></div>
        </form>
      </div>
      {found && (
        <div className="st-card" style={{ padding: 18 }}>
          <div className="st-form">
            <p style={{ margin: 0 }}>Granting to <strong>{found.name}</strong> <span style={{ color: '#777' }}>({found.email})</span></p>
            <div className="st-form-row">
              <label><span>Amount (NZ$)</span>
                <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 25" /></label>
              <label><span>Note (optional)</span>
                <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Gate crew, Saturday" maxLength={200} /></label>
            </div>
            <div><button className="st-btn" disabled={busy} onClick={grant}>{busy ? 'Granting…' : 'Grant balance'}</button></div>
          </div>
        </div>
      )}
    </>
  );
}
