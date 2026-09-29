'use client';
import { useEffect, useState } from 'react';
import { CARD, EMPTY, H1, SUB, TABLE, TABLEWRAP, TD, TH, BTN_PRIMARY, BTN_DANGER } from '../../../lib/tokens';
import { useAdminApi } from '../../../components/useAdminApi';

export default function AdminClaims() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const call = useAdminApi();
  async function load() {
    setErr('');
    try {
      setRows(await call('/claims?status=pending'));
    } catch (e) { setErr(/401|403/.test(e.message) ? 'Admin login required.' : e.message); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  async function decide(id, approve) {
    setBusy(true); setErr('');
    try {
      await call(`/claims/${id}`, {
        method: 'POST', body: JSON.stringify({ approve }),
      });
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
