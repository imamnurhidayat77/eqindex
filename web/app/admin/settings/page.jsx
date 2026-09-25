'use client';
import { useState } from 'react';
import { API } from '../../../lib/api';
import { CARD, H1, H2, SUB, INP, BTN_PRIMARY } from '../../../lib/tokens';

export default function AdminSettings() {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [next2, setNext2] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function changePw(e) {
    e.preventDefault();
    setErr(''); setMsg('');
    if (next !== next2) { setErr('New passwords do not match.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API}/auth/password`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current: cur, next }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      setMsg('Password changed — all sessions revoked. Please log in again.');
      setCur(''); setNext(''); setNext2('');
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  return (
    <>
      <h1 className={H1}>Settings</h1>
      <p className={SUB}>Workspace security and session control.</p>
      {err && <section className={CARD}><p className="text-blood text-sm">{err}</p></section>}
      {msg && <section className={CARD}><p className="text-moss text-sm">{msg}</p></section>}
      <section className={CARD} style={{ maxWidth: 460 }}>
        <h2 className={H2}>Change password</h2>
        <form onSubmit={changePw} className="flex flex-col gap-3 mt-2">
          <label className="text-xs text-muted flex flex-col gap-1">Current password
            <input className={INP} type="password" required autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></label>
          <label className="text-xs text-muted flex flex-col gap-1">New password (min 8 chars)
            <input className={INP} type="password" required autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></label>
          <label className="text-xs text-muted flex flex-col gap-1">Confirm new password
            <input className={INP} type="password" required autoComplete="new-password" value={next2} onChange={(e) => setNext2(e.target.value)} /></label>
          <button className={BTN_PRIMARY} disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
        </form>
      </section>
    </>
  );
}
