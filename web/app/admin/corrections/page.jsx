'use client';
import { useEffect, useRef, useState } from 'react';
import { CARD, EMPTY, H1, SUB, TABLE, TABLEWRAP, TD, TH, INP, BTN_PRIMARY, BTN_DANGER, badge, BADGE } from '../../../lib/tokens';
import { useAdminApi } from '../../../components/useAdminApi';
import { AdminCardsSk } from '../../../components/Skeletons';

const STATUSES = ['open', 'in_review', 'resolved', 'rejected'];
const stBadge = (s) => s === 'open' ? badge(BADGE.goldfill) : s === 'in_review' ? badge(BADGE.blue)
  : s === 'resolved' ? badge(BADGE.green) : badge(BADGE.gray);

export default function AdminCorrections() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('open');
  const [note, setNote] = useState({});
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const seq = useRef(0);
  const call = useAdminApi();
  async function load() {
    // Sequence guard: fast filter switches must not let a stale
    // response overwrite the current filter's rows.
    const my = ++seq.current;
    setLoading(true); setErr('');
    try {
      const data = await call(`/admin/corrections?status=${status}`);
      if (seq.current === my) setRows(data);
    }
    catch (e) { if (seq.current === my) setErr(e.message); }
    if (seq.current === my) setLoading(false);
  }
  useEffect(() => { load(); }, [status]);
  async function decide(id, st) {
    if (busyId) return;
    setBusyId(id); setErr('');
    try {
      await call(`/admin/corrections/${id}`, { method: 'POST', body: JSON.stringify({ status: st, resolved_note: note[id] || undefined }) });
      setNote((n) => { const c = { ...n }; delete c[id]; return c; });
      await load();
    } catch (e) { setErr(e.message); }
    setBusyId(null);
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
        <section className={`${CARD} ${r.status === 'open' ? 'border-l-2 !border-l-gold/70' : ''}`} key={r.id}>
          <div className="flex flex-wrap gap-2 items-center mb-1.5">
            <b>{r.subject}</b><span className={stBadge(r.status)}>{r.status.replace('_', ' ')}</span>
            <span className="text-faint text-[12px]">{r.name} · {r.email} · {(r.created_at || '').slice(0, 10)}</span>
          </div>
          <p className="text-sm">{r.message}</p>
          {r.entity_type && <p className="text-faint text-[12px] mt-1">About: {r.entity_type}{r.entity_id ? ` · ${String(r.entity_id).slice(0, 8)}` : ''}</p>}
          {(r.status === 'open' || r.status === 'in_review') && (
            <div className="flex flex-wrap gap-2 mt-2.5 items-end">
              <label className="text-xs text-muted flex flex-col gap-1">Resolution note
                <input className={INP} value={note[r.id] || ''} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} placeholder="optional" disabled={busyId === r.id} /></label>
              {r.status === 'open' && <button className={BTN_PRIMARY} disabled={busyId === r.id} onClick={() => decide(r.id, 'in_review')}>Take up</button>}
              <button className={BTN_PRIMARY} disabled={busyId === r.id} onClick={() => decide(r.id, 'resolved')}>{busyId === r.id ? 'Working…' : 'Resolve'}</button>
              <button className={BTN_DANGER} disabled={busyId === r.id} onClick={() => decide(r.id, 'rejected')}>Reject</button>
            </div>
          )}
          {r.resolved_note && <p className="text-moss text-[13px] mt-2">Resolution: {r.resolved_note}</p>}
        </section>
      ))}
      {!rows.length && !loading && <section className={CARD}><p className={EMPTY}>Nothing in {status.replace('_', ' ')}.</p></section>}
      {loading && <AdminCardsSk n={3} />}
    </>
  );
}
