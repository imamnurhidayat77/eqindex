'use client';
import { useEffect, useState } from 'react';
import { API } from '../../../lib/api';
import { CARD, EMPTY, H1, SUB, TABLE, TABLEWRAP, TD, TH, INP, badge, BADGE } from '../../../lib/tokens';
import Dropdown from '../../../components/Dropdown';

const ACT_CLS = { review: 'goldfill', claim: 'blue', training: 'green', health: 'green', watchlist: 'gray', comparison: 'gray', coach: 'blue' };
const ENTITIES = ['', 'horse', 'rider', 'event', 'series', 'user', 'combination', 'entity'];

export default function AdminActivity() {
  const [rows, setRows] = useState([]);
  const [actions, setActions] = useState([]);
  const [f, setF] = useState({ action: '', entity: '', actor: '', since: '', until: '' });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  async function load(filters) {
    setLoading(true); setErr('');
    try {
      const p = new URLSearchParams({ limit: '100' });
      for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
      const res = await fetch(`${API}/admin/activity?${p}`, { credentials: 'include' });
      if (res.status === 401 || res.status === 403) { setErr('Admin login required.'); setRows([]); }
      else setRows((await res.json()).data || []);
    } catch { setErr('API unreachable.'); }
    setLoading(false);
  }
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/admin/activity/actions`, { credentials: 'include' });
        if (res.ok) setActions((await res.json()).data || []);
      } catch { /* optional */ }
    })();
  }, []);
  useEffect(() => {
    const t = setTimeout(() => load(f), f.actor ? 350 : 0);
    return () => clearTimeout(t);
  }, [f.action, f.entity, f.actor, f.since, f.until]);
  const set = (k) => (v) => setF((prev) => ({ ...prev, [k]: typeof v === 'object' && v?.value !== undefined ? v.value : v }));
  const fmt = (d) => { try { return new Date(d).toLocaleString('en-NZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return d; } };
  const dirty = Object.values(f).some(Boolean);
  return (
    <>
      <h1 className={H1}>Activity audit</h1>
      <p className={SUB}>Every material change, who made it, and when.</p>
      <div className="mb-4 rounded border border-line bg-card p-4 flex flex-wrap gap-2.5 items-end">
        <label className="text-xs text-muted flex flex-col gap-1.5">Action
          <Dropdown ariaLabel="Action filter" value={f.action} placeholder="All actions" searchable
            options={[{ value: '', label: 'All actions' }, ...actions.map((a) => ({ value: a.action, label: `${a.action} (${a.n})` }))]}
            onSelect={(o) => setF((p) => ({ ...p, action: o.value }))} buttonClassName="min-w-[190px]" menuClassName="min-w-[220px]" /></label>
        <label className="text-xs text-muted flex flex-col gap-1.5">Entity
          <Dropdown ariaLabel="Entity filter" value={f.entity} placeholder="All entities"
            options={ENTITIES.map((e) => ({ value: e, label: e || 'All entities' }))}
            onSelect={(o) => setF((p) => ({ ...p, entity: o.value }))} buttonClassName="min-w-[150px]" /></label>
        <label className="text-xs text-muted flex flex-col gap-1.5">Actor
          <input className={INP} value={f.actor} onChange={(e) => set('actor')(e.target.value)} placeholder="name or email…" style={{ width: 170 }} /></label>
        <label className="text-xs text-muted flex flex-col gap-1.5">Since
          <input className={`${INP} py-[7px]`} type="date" value={f.since} onChange={(e) => set('since')(e.target.value)} /></label>
        <label className="text-xs text-muted flex flex-col gap-1.5">Until
          <input className={`${INP} py-[7px]`} type="date" value={f.until} onChange={(e) => set('until')(e.target.value)} /></label>
        {dirty && <button onClick={() => setF({ action: '', entity: '', actor: '', since: '', until: '' })}
          className="text-sky text-[13px] bg-none border-0 cursor-pointer hover:text-white pb-2">Reset ✕</button>}
        <span className="ml-auto text-[12px] text-faint pb-2">{!loading && `${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}`}</span>
      </div>
      {err && <section className={CARD}><p className="text-blood text-sm">{err}</p></section>}
      <section className={CARD}>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr><th className={TH}>When</th><th className={TH}>Actor</th><th className={TH}>Action</th><th className={TH}>Entity</th><th className={TH}>Detail</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={`${TD} text-muted whitespace-nowrap`}>{fmt(r.created_at)}</td>
                <td className={TD}>{r.actor}</td>
                <td className={TD}><span className={badge(BADGE[ACT_CLS[r.action.split('.')[0]] || 'gray'])}>{r.action}</span></td>
                <td className={TD}>{r.entity_type}{r.entity_id ? <span className="text-faint"> · {String(r.entity_id).slice(0, 8)}</span> : ''}</td>
                <td className={`${TD} text-muted`}><code>{JSON.stringify(r.detail)}</code></td>
              </tr>
            ))}
            {!rows.length && !loading && !err && <tr><td colSpan={5} className={EMPTY}>No audit entries match these filters.</td></tr>}
            {loading && <tr><td colSpan={5} className={EMPTY}>Loading…</td></tr>}
          </tbody>
        </table>
        </div>
      </section>
    </>
  );
}
