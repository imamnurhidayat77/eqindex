'use client';
import { useState } from 'react';
import { API } from '../../lib/api';

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
      <>
        <h1 className="page-title">Request received</h1>
        <div className="card" style={{ padding: 28, maxWidth: 640 }}>
          <p>Thanks — we review takedowns within <b>48 hours</b> and will confirm the outcome at your contact details.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="page-title">Request takedown</h1>
      <p className="caption" style={{ margin: '6px 0 18px' }}>Reviewed within 48 hours. Buyers keep files they already paid for.</p>
      <form onSubmit={submit} className="card" style={{ padding: 28, maxWidth: 640 }}>
        <div className="field"><label htmlFor="td-url">Photo page link</label>
          <input id="td-url" value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://bossmedia.nz/p/…" /></div>
        <div className="field"><label htmlFor="td-rel">Your relationship to the photo</label>
          <select id="td-rel" value={form.relationship} onChange={(e) => set('relationship', e.target.value)}>
            <option value="">Select…</option>
            <option>That&apos;s me</option>
            <option>Parent / guardian</option>
            <option>That&apos;s my horse</option>
            <option>Photographer / other rights holder</option>
            <option>Other</option>
          </select></div>
        <div className="field"><label htmlFor="td-why">Why should it come down? (optional)</label>
          <input id="td-why" value={form.reason} onChange={(e) => set('reason', e.target.value)} placeholder="e.g. that&apos;s my child, please remove" maxLength={300} /></div>
        <div className="field"><label htmlFor="td-contact">Your contact (email or phone)</label>
          <input id="td-contact" value={form.contact} onChange={(e) => set('contact', e.target.value)} placeholder="How we confirm the outcome" /></div>
        {msg && <p className="err" role="alert">{msg}</p>}
        <button type="submit" disabled={busy} className="btn btn-primary btn-lg">{busy ? 'Sending…' : 'Request takedown'}</button>
      </form>
    </>
  );
}
