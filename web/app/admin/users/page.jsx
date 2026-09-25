'use client';
import { useEffect, useState } from 'react';
import { API } from '../../../lib/api';
import { CARD, EMPTY, H1, SUB, TABLE, TABLEWRAP, TD, TH, NUM, INP, BTN_DANGER } from '../../../lib/tokens';

const ROLES = ['PUBLIC', 'RIDER', 'COACH', 'OWNER', 'BREEDER', 'ADMIN'];

export default function AdminUsers() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  async function call(path, opts = {}) {
    const res = await fetch(`${API}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
    return j.data;
  }
  async function load(query = '') {
    setLoading(true); setErr('');
    try { setRows(await call(`/admin/users${query ? `?q=${encodeURIComponent(query)}` : ''}`)); }
    catch (e) { setErr(e.message); }
    setLoading(false);
  }
  useEffect(() => {
    const t = setTimeout(() => load(q.trim()), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q]);
  async function setRole(u, role) {
    setErr('');
    try { await call(`/admin/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ role }) }); await load(q.trim()); }
    catch (e) { setErr(e.message); }
  }
  async function revoke(u) {
    if (!window.confirm(`Revoke all sessions for ${u.name} (${u.email})? They will be logged out everywhere.`)) return;
    setErr('');
    try {
      const j = await call(`/admin/users/${u.id}/sessions`, { method: 'DELETE' });
      alert(`Revoked ${j.revoked} session(s).`);
      await load(q.trim());
    } catch (e) { setErr(e.message); }
  }
  return (
    <>
      <h1 className={H1}>Users</h1>
      <p className={SUB}>Roles, sessions and access control. You cannot demote or lock yourself out.</p>
      {err && <section className={CARD}><p className="text-blood text-sm">{err}</p></section>}
      <div className="mb-4">
        <input className={INP} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email…" style={{ maxWidth: 320, width: '100%' }} />
      </div>
      <section className={CARD}>
        <div className={TABLEWRAP}>
        <table className={`${TABLE} sticky-head`}>
          <thead><tr><th className={TH}>Name</th><th className={TH}>Email</th><th className={TH}>Role</th><th className={`${TH} ${NUM}`}>Sessions</th><th className={TH}>Since</th><th className={TH}></th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td className={TD}><b>{u.name}</b></td>
                <td className={`${TD} text-muted`}>{u.email}</td>
                <td className={TD}>
                  <select className={INP} value={u.role} onChange={(e) => setRole(u, e.target.value)}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td className={`${TD} ${NUM} ${u.active_sessions ? 'text-moss font-bold' : 'text-faint'}`}>{u.active_sessions}</td>
                <td className={`${TD} text-muted`}>{(u.created_at || '').slice(0, 10)}</td>
                <td className={TD}>
                  <button className={BTN_DANGER} disabled={!u.active_sessions} onClick={() => revoke(u)}>Revoke sessions</button>
                </td>
              </tr>
            ))}
            {!rows.length && !loading && <tr><td colSpan={6} className={EMPTY}>No users found.</td></tr>}
            {loading && <tr><td colSpan={6} className={EMPTY}>Loading…</td></tr>}
          </tbody>
        </table>
        </div>
      </section>
    </>
  );
}
