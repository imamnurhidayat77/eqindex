'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { nzdc, studio } from '../../lib/studio';
import { useAuthed } from '../../lib/use-authed';
import { Icon, SiteFooter, SiteHeader } from '../../components/figma';

import { useDocumentTitle } from '../../lib/use-document-title';

const TABS = [['events', 'My events'], ['balance', 'Balance']];

export default function OrganizerPage() {
  useDocumentTitle('Organizer');
  const { user, loading } = useAuthed();
  const [tab, setTab] = useState('events');
  const state = loading ? 'loading'
    : !user ? 'login'
    : (user.role === 'ORGANIZER' || user.role === 'ADMIN' ? 'ok' : 'denied');

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
      <SiteHeader />
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
        <div className="st-card" style={{ padding: 18, marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <strong>Volunteers</strong>
            <p className="st-csub" style={{ margin: '4px 0 0' }}>Roster the crew per event and share commission as spend-only balance.</p>
          </div>
          <Link href="/organizer/volunteers" className="st-btn" style={{ textDecoration: 'none' }}>Open volunteers <Icon name="arrow" size={15} /></Link>
        </div>
      </main>
      <SiteFooter />
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
  useEffect(() => { load(); }, []);
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
        <h3 style={{ margin: '0 0 4px' }}>New event</h3>
        <p className="st-csub">List a show to open pre-book coverage and earn 10% of every photo sale.</p>
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
      {!rows.length ? (
        <div className="event-media-empty">
          <p className="eyebrow">No events yet</p>
          <h3>Create your first event above.</h3>
          <p>It takes a minute — riders can pre-book as soon as it’s listed.</p>
        </div>
      ) : (
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


