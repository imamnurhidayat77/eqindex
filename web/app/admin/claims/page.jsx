'use client';
import { useEffect, useState } from 'react';
import { API } from '../../../lib/api';
import { CARD, EMPTY, H1, SUB, TABLE, TABLEWRAP, TD, TH, BTN_PRIMARY, BTN_DANGER } from '../../../lib/tokens';

export default function AdminClaims() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    setErr('');
    try {
      const res = await fetch(`${API}/claims?status=pending`, { credentials: 'include' });
      if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'Admin login required.' : `Failed (${res.status})`);
      setRows((await res.json()).data || []);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  async function decide(id, approve) {
    setBusy(true); setErr('');
    try {
      const res = await fetch(`${API}/claims/${id}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approve }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      await load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  return (
    <>
      <h1 className={H1}>Rider claims</h1>
      <p className={SUB}>Approve rider ownership of profile rows — links account to results.</p>
      {err && <section className={CARD}><p className="text-blood text-sm">{err}</p></section>}
      <section className={CARD}>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr><th className={TH}>Rider</th><th className={TH}>Claimant</th><th className={TH}>Note</th><th className={TH}>Since</th><th className={TH}></th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td className={TD}><b>{c.rider}</b></td>
                <td className={TD}>{c.claimant}</td>
                <td className={`${TD} text-muted`}>{c.note || '—'}</td>
                <td className={`${TD} text-muted`}>{(c.created_at || '').slice(0, 10)}</td>
                <td className={TD}>
                  <span className="flex gap-2">
                    <button className={BTN_PRIMARY} disabled={busy} onClick={() => decide(c.id, true)}>Approve</button>
                    <button className={BTN_DANGER} disabled={busy} onClick={() => decide(c.id, false)}>Reject</button>
                  </span>
                </td>
              </tr>
            ))}
            {!rows.length && !loading && <tr><td colSpan={5} className={EMPTY}>No pending claims.</td></tr>}
            {loading && <tr><td colSpan={5} className={EMPTY}>Loading…</td></tr>}
          </tbody>
        </table>
        </div>
      </section>
    </>
  );
}
