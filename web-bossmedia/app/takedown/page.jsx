'use client';
import { useState } from 'react';
import { API } from '../../lib/api';
import PageShell from '../../components/PageShell';
import SearchSelect from '../../components/SearchSelect';

const RELATIONSHIPS = [
  "That's me",
  'Parent / guardian',
  "That's my horse",
  'Photographer / other rights holder',
  'Other',
];

export default function TakedownPage() {
  const [form, setForm] = useState({ url: '', reason: '', relationship: '', contact: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function idFromUrl(u) {
    const m = String(u).match(/\/p\/([0-9a-f-]{8,}[0-9a-f-]*)/i) || String(u).match(/\/photos\/([0-9a-f-]{8,}[0-9a-f-]*)/i);
    return m ? m[1] : null;
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setMsg('');
    const id = idFromUrl(form.url);
    if (!id) { setMsg('Paste the photo page link (e.g. bossmedia.nz/p/…).'); return; }
    if (!form.contact.trim()) { setMsg('Leave contact details so we can confirm the outcome.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/media/${id}/takedown`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: `${form.relationship ? `[${form.relationship}] ` : ''}${form.reason} — contact: ${form.contact}`.slice(0, 500) }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 401) throw new Error('Log in first so we can link the request to your account.');
      if (!res.ok) throw new Error(j.error || 'Request failed — try again.');
      setDone(true);
    } catch (e2) { setMsg(e2.message); setBusy(false); }
  }

  if (done) {
    return (
      <PageShell eyebrow="Takedown" title="Request received.">
        <div className="card-dark">
          <p>Thanks — we review takedowns within <b>48 hours</b> and will confirm the outcome at your contact details.</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell eyebrow="Takedown" title="Request takedown."
      intro="Reviewed within 48 hours. Buyers keep files they already paid for.">
      <form onSubmit={submit} className="booking-form" style={{ maxWidth: 640 }}>
        <section>
          <label className="booking-field full"><span>Photo page link</span>
            <input value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://bossmedia.nz/p/…" /></label>
          <label className="booking-field full" style={{ marginTop: 20 }}><span>Your relationship to the photo</span>
            <SearchSelect options={RELATIONSHIPS.map((r) => ({ id: r, label: r }))} value={form.relationship || null}
              onChange={(id) => set('relationship', id || '')} placeholder="Select…" clearable={false} /></label>
          <label className="booking-field full" style={{ marginTop: 20 }}><span>Why should it come down? (optional)</span>
            <input value={form.reason} onChange={(e) => set('reason', e.target.value)} placeholder="e.g. that's my child, please remove" maxLength={300} /></label>
          <label className="booking-field full" style={{ marginTop: 20 }}><span>Your contact (email or phone)</span>
            <input value={form.contact} onChange={(e) => set('contact', e.target.value)} placeholder="How we confirm the outcome" /></label>
          {msg && <p className="auth-error" role="alert" style={{ marginTop: 16 }}>{msg}</p>}
          <button type="submit" disabled={busy}
            style={{ marginTop: 22, width: '100%', minHeight: 52, display: 'flex', justifyContent: 'center', alignItems: 'center', border: 0, color: '#101010', background: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {busy ? 'Sending…' : 'Request takedown'}
          </button>
        </section>
      </form>
    </PageShell>
  );
}
