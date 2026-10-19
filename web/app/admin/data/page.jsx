'use client';
import { useState } from 'react';
import { API } from '../../../lib/api';
import { CARD, H1, H2, SUB, INP, BTN_PRIMARY, BTN_DANGER } from '../../../lib/tokens';

export default function AdminData() {
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  function download() {
    window.location.href = `${API}/admin/export`;
  }
  async function maintenance() {
    setErr(''); setMsg(''); setBusy(true);
    try {
      const res = await fetch(`${API}/admin/maintenance/run`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: ['retention', 'nudges'] }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      const r = j.data?.retention || {}, n = j.data?.nudges || {};
      setMsg(`Maintenance done: ${r.cleaned ?? 0} stale drafts cleaned, ${n.nudged ?? 0} checkout reminders sent.`);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  async function wipe() {
    setErr(''); setMsg('');
    if (confirm !== 'WIPE COMPETITION DATA') { setErr('Type the exact phrase to confirm.'); return; }
    if (!window.confirm('Final check: delete ALL competition data? Masters (horses/riders/users) stay.')) return;
    setBusy(true);
    try {
      const res = await fetch(`${API}/admin/export`.replace('/export', '/wipe'), {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      setMsg(`Wiped: ${Object.entries(j.deleted).map(([k, v]) => `${k} ${v}`).join(', ')}. Export first if you need it back.`);
      setConfirm('');
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  return (
    <>
      <h1 className={H1}>Data tools</h1>
      <p className={SUB}>Backup before you touch anything destructive.</p>
      {err && <section className={CARD}><p className="text-blood text-sm">{err}</p></section>}
      {msg && <section className={CARD}><p className="text-moss text-sm">{msg}</p></section>}
      <section className={CARD}>
        <h2 className={H2}>Full backup (JSON)</h2>
        <p className="text-muted text-sm mt-1 mb-3">Every table, password hashes stripped. Note: browser download needs an admin session cookie — log in first.</p>
        <button className={BTN_PRIMARY} onClick={download}>Download backup</button>
      </section>
      <section className={CARD}>
        <h2 className={H2}>Maintenance — retention & reminders</h2>
        <p className="text-muted text-sm mt-1 mb-3">Deletes storage files of unpublished drafts older than 90 days (published work never touched) and sends one checkout reminder per stale pending order. For automation, schedule Cloud Scheduler against <code>/admin/maintenance/run</code> with header <code>x-maintenance-secret</code> = MAINTENANCE_SECRET.</p>
        <button className={BTN_PRIMARY} disabled={busy} onClick={maintenance}>{busy ? 'Running…' : 'Run maintenance now'}</button>
      </section>
      <section className={CARD}>
        <h2 className={H2}>Danger zone — wipe competition data</h2>
        <p className="text-muted text-sm mt-1 mb-3">Deletes rounds, classes, events, series standings, raw results and weather cache. Masters stay. Type <code>WIPE COMPETITION DATA</code> to arm.</p>
        <input className={INP} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="WIPE COMPETITION DATA" style={{ maxWidth: 320, width: '100%' }} />
        <div className="mt-3">
          <button className={BTN_DANGER} disabled={busy} onClick={wipe}>{busy ? 'Wiping…' : 'Wipe competition data'}</button>
        </div>
      </section>
    </>
  );
}
