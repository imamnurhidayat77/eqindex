'use client';
import { useEffect, useState } from 'react';
import { API } from '../../../lib/api';
import { CARD, EMPTY, H1, SUB, TABLE, TABLEWRAP, TD, TH, INP, BTN_PRIMARY, badge, BADGE } from '../../../lib/tokens';

const STATUSES = ['open', 'in_review', 'resolved', 'rejected'];
const stBadge = (s) => s === 'open' ? badge(BADGE.goldfill) : s === 'in_review' ? badge(BADGE.blue)
  : s === 'resolved' ? badge(BADGE.green) : badge(BADGE.gray);

export default function AdminCorrections() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('open');
  const [note, setNote] = useState({});
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  async function call(path, opts = {}) {
    const res = await fetch(`${API}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
    return j.data;
  }
  async function load() {
    setLoading(true); setErr('');
    try { setRows(await call(`/admin/corrections?status=${status}`)); }
    catch (e) { setErr(e.message); }
    setLoading(false);
  }
  useEffect(() => { load(); }, [status]);
  async function decide(id, st) {
    setErr('');
    try {
      await call(`/admin/corrections/${id}`, { method: 'POST', body: JSON.stringify({ status: st, resolved_note: note[id] || undefined }) });
      await load();
    } catch (e) { setErr(e.message); }
  }
  return (
    <>
      <h1 className={H1}>Corrections inbox</h1>
      <p className={SUB}>Public reports triaged to resolution — every decision audited.</p>
      {err && <section className={CARD}><p className="text-blood text-sm">{err}</p></section>}
      <div className="mb-4 flex gap-2">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1.5 text-[12px] border ${status === s ? 'bg-goldbg border-gold text-gold font-bold' : 'bg-card2 border-line text-muted'}`}>{s.replace('_', ' ')}</button>
        ))}
      </div>
      {rows.map((r) => (
        <section className={CARD} key={r.id}>
          <div className="flex flex-wrap gap-2 items-center mb-1.5">
            <b>{r.subject}</b><span className={stBadge(r.status)}>{r.status.replace('_', ' ')}</span>
            <span className="text-faint text-[12px]">{r.name} · {r.email} · {(r.created_at || '').slice(0, 10)}</span>
          </div>
          <p className="text-sm">{r.message}</p>
          {r.entity_type && <p className="text-faint text-[12px] mt-1">About: {r.entity_type}{r.entity_id ? ` · ${String(r.entity_id).slice(0, 8)}` : ''}</p>}
          {(status === 'open' || status === 'in_review') && (
            <div className="flex flex-wrap gap-2 mt-2.5 items-end">
              <label className="text-xs text-muted flex flex-col gap-1">Resolution note
                <input className={INP} value={note[r.id] || ''} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} placeholder="optional" /></label>
              {status === 'open' && <button className={BTN_PRIMARY} onClick={() => decide(r.id, 'in_review')}>Take up</button>}
              <button className={BTN_PRIMARY} onClick={() => decide(r.id, 'resolved')}>Resolve</button>
              <button className="text-blood text-sm" onClick={() => decide(r.id, 'rejected')}>Reject</button>
            </div>
          )}
          {r.resolved_note && <p className="text-moss text-[13px] mt-2">Resolution: {r.resolved_note}</p>}
        </section>
      ))}
      {!rows.length && !loading && <section className={CARD}><p className={EMPTY}>Nothing in {status.replace('_', ' ')}.</p></section>}
    </>
  );
}
