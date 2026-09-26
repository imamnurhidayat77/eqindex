'use client';
import { useState } from 'react';
import { API } from '../../lib/api';
import { CARD, H1, SUB, INP, BTN_PRIMARY, MUT } from '../../lib/tokens';
import Dropdown from '../../components/Dropdown';

const TYPES = ['', 'horse', 'rider', 'event', 'class', 'result', 'other'];

export default function Contact() {
  const [f, setF] = useState({ name: '', email: '', subject: 'Correction', entity_type: '', entity_id: '', message: '' });
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    setErr(''); setOk(''); setBusy(true);
    try {
      const res = await fetch(`${API}/corrections`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      setOk('Report received — curators review every submission.');
      setF({ name: '', email: '', subject: 'Correction', entity_type: '', entity_id: '', message: '' });
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  return (
    <>
      <h1 className={H1}>Contact</h1>
      <p className={SUB}>Organisers, riders, and data corrections.</p>
      <section className={CARD}>
        <p>To submit show results, request data corrections, or discuss data
        partnerships (ESNZ, timing providers):</p>
        <p><b>hello@eqindex.example.nz</b></p>
        <p className={MUT}>Result files accepted: CSV and Excel exports from common
        timing systems. Series and calendar gaps can also be flagged for review.</p>
      </section>
      <section className={CARD}>
        <h2 className="text-[15px] font-bold mb-2">Report a correction</h2>
        <form onSubmit={submit} className="grid md:grid-cols-2 gap-3">
          <label className="text-xs text-muted flex flex-col gap-1">Name
            <input className={INP} required value={f.name} onChange={set('name')} /></label>
          <label className="text-xs text-muted flex flex-col gap-1">Email
            <input className={INP} type="email" required value={f.email} onChange={set('email')} /></label>
          <label className="text-xs text-muted flex flex-col gap-1">Subject
            <input className={INP} value={f.subject} onChange={set('subject')} /></label>
          <label className="text-xs text-muted flex flex-col gap-1">Relates to
            <Dropdown ariaLabel="Relates to" value={f.entity_type}
              options={TYPES.map((t) => ({ value: t, label: t || '—' }))}
              onSelect={(o) => setF({ ...f, entity_type: o.value })} /></label>
          <label className="text-xs text-muted flex flex-col gap-1 md:col-span-2">Message
            <textarea className={INP} required rows={4} value={f.message} onChange={set('message')}
              placeholder="Which result is wrong and what should it be?" /></label>
        </form>
        {err && <p className="text-blood text-sm mt-2">{err}</p>}
        {ok && <p className="text-moss text-sm mt-2">{ok}</p>}
        <div className="mt-3">
          <button className={BTN_PRIMARY} disabled={busy} onClick={submit}>{busy ? 'Sending…' : 'Send report'}</button>
        </div>
      </section>
    </>
  );
}
